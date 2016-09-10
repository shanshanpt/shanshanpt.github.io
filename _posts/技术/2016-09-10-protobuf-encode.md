---
layout: post
title: Protobuf 编码过程及规则
category: 技术
tags: protobuf
keywords:
description:
---

很长时间没有安心写写博客了, "很久"之前写过一篇protobuf的使用, 详情请见: <a href="http://shanshanpt.github.io/2016/05/03/go-protobuf.html"  target="_blank">protobuf使用</a>.
最近抽了一些时间看了下编码过程, 今晚有时间顺便记下来吧.<br>


###1. 数据编码类型

首先看一下有哪些编码类型, 此处以go语言版本为例, 在proto/properties.go文件中有定义:

```
// Constants that identify the encoding of a value on the wire.
// 编码值的类型, tag code
//
const (
	WireVarint     = 0  // int32, int64, uint32, uint64, ,sint32 sint64, bool, enum. 变长，1-10个字节，用VARINT编码且压缩
	WireFixed64    = 1  // fixed64, sfixed64, double . 固定8个字节
	WireBytes      = 2  // string, bytes, embedded messages, packed repeated fields. 变长，在key后会跟一个编码过的长度字段
	WireStartGroup = 3  // 一个组（该组可以是嵌套类型，也可以是repeated类型）的开始标志。
	WireEndGroup   = 4  // 一个组（该组可以是嵌套类型，也可以是repeated类型）的结束标志。
	WireFixed32    = 5  // fixed32, sfixed32, float. 固定4个字节
)
```
这些类型都比较好理解, 需要注意的是WireEndGroup和WireStartGroup用于嵌套数组类型. 也就是说, 如果pbMsg中又存在一个字段也是数组或者slice类型,
那么需要这这前后标志.<br>
关于数据类型type, 是和数据字段的tag一起编码的, 这里提前说明一下, 看下面的代码:

```
// 例如:
message myMsg
{
    required int32  id = 1;
    required string str = 2;
    optional int64  opt = 3;
}

//后面的1,2,3我们成为字段的tag. id的数据类型是int32, str类型是string, opt类型是int64, 这个分别对应到
//之前说过的数据类型是WireVarint,WireBytes和WireVarint.在protobuf中, 使用3B空间来对数据类型进行编码,
//并且直接放在tag后面!具体看下面的代码: proto/properties.go文件中有定义

func (p *Properties) setTag(lockGetProp bool) {
	// precalculate tag code
	wire := p.WireType
	if p.Packed {
		wire = WireBytes
	}
	//
	// 下面是规定的type组成: type << 3 | wireType
	// 将数据类型放在tag后面! ! !
	// ===> tag和type一起编码
	// 如果是上面的例子, 那么就是:
	// id:  1和WireVarint一起编码
	// str: 2和WireBytes一起编码
	// opt: 3和WireVarint一起编码
	x := uint32(p.Tag)<<3 | uint32(wire)

	// 注意tag在存储的时候也是使用Varint进行编码的
	// 下面就是编码规则!!!, 在encode.go中有解释
	// <如果这个目前还看不懂, 下面会具体进行解释~~~>
	i := 0
	for i = 0; x > 127; i++ {
		p.tagbuf[i] = 0x80 | uint8(x&0x7F)
		x >>= 7
	}
	// 最后一个字节
	p.tagbuf[i] = uint8(x)

	// 将编码后的字节s放进tagcode中
	p.tagcode = p.tagbuf[0 : i+1]

	if p.stype != nil {
		if lockGetProp {
			p.sprop = GetProperties(p.stype)
		} else {
			p.sprop = getPropertiesLocked(p.stype)
		}
	}
}
```


###2. 编码过程

Protobuf的编码是尽其所能地将字段的元信息和字段的值压缩存储，并且字段的元信息中含有对这个字段描述的所有信息。
编码的最终结果可以使用下图来表示:

![1](/public/img/grocery/protobuf/protobuf-1.png  "编码结构")<br>

tag和type是放在实际的value之前的, 具体的每种不同类型的值怎么进行编码, 下面会细细说来.<br>

<br>
####2.1 不同类型数据编码方法

<br>
#####2.1.1 Varint类型编码
这里有两种形式的函数, 一种是给我们自由调用, 一种是Buffer函数的函数, 实现方法本质上来说是一样的.

```
// 自由调用函数
// 返回Varint类型编码后的字节流(int32, int64, uint32, uint64, bool, and enum)
func EncodeVarint(x uint64) []byte {
	var buf [maxVarintBytes]byte
	var n int
	// 下面的编码规则需要详细理解:
	// 1.每个字节的最高位是保留位, 如果是1说明后面的字节还是属于当前数据的,如果是0,那么这是当前数据的最后一个字节数据
	//  看下面代码,因为一个字节最高位是保留位,那么这个字节中只有下面7bits可以保存数据
	//  所以,如果x>127,那么说明这个数据还需大于一个字节保存,所以当前字节最高位是1,看下面的buf[n] = 0x80 | ...
	//  0x80说明将这个字节最高位置为1, 后面的x&0x7F是取得x的低7位数据, 那么0x80 | uint8(x&0x7F)整体的意思就是
	//  这个字节最高位是1表示这不是最后一个字节,后面7为是正式数据! 注意操作下一个字节之前需要将x>>=7
	// 2.看如果x<=127那么说明x现在使用7bits可以表示了,那么最高位没有必要是1,直接是0就ok!所以最后直接是buf[n] = uint8(x)
	//
	// 如果数据大于一个字节(127是一个字节最大数据), 那么继续, 即: 需要在最高位加上1
	for n = 0; x > 127; n++ {
	    // x&0x7F表示取出下7bit数据, 0x80表示在最高位加上1
		buf[n] = 0x80 | uint8(x&0x7F)
		// 继续后面的数据处理
		x >>= 7
	}
	// 最后一个字节数据
	buf[n] = uint8(x)
	n++
	return buf[0:n]
}

// Buffer内部函数
// 函数将一个varint数据编码之后写到buffer中
func (p *Buffer) EncodeVarint(x uint64) error {
	// 这里的编码原则和上面是一样的!
	// 如果x >= 1<<7 等价于: x >= 128, 那么显然是7bits保存不了的, 7bit最多保存到127
	for x >= 1<<7 {
		// append到buf中
		p.buf = append(p.buf, uint8(x&0x7f|0x80))
		x >>= 7
	}
	// 最后一个字节
	p.buf = append(p.buf, uint8(x))
	return nil
}
```
编码规则在上面第一个函数注释中已经描述了. <br>
如果上面的文字不是很清楚, 那么看看下图可能会好理解一些(<a href="http://images.cnitblog.com/blog/384029/201303/02195954-7aadb61192734fc2bb7033283e1d2d65.png"  target="_blank">图片链接</a>): <br>

variant是一种紧凑型数字编码，如下图所示是数字131415的variant编码:

![1](/public/img/grocery/protobuf/protobuf-2.png  "varint编码")<br>

第一个字节的高位为1表示下一个字节还有有效数据，直到找到后面字节的最高位为0表示该字节是最后一组有效数字。这几个字节共同组成这个字段的有效数字。<br>
注意: 数据的存储采用的是小端序, 不是很了解的可以google, 或者看我很久很久之前写一篇很烂的blog(Orz...): <a href="http://blog.csdn.net/shanshanpt/article/details/7365613"  target="_blank">大端序小端序</a>
我们看到, variant编码存储比较小的整数时很节省空间，小于等于127的数字可以用一个字节存储。
但缺点是对于大于268435455（0xfffffff）的整数需要5个字节来存储。但是一般情况下（尤其在tag编码中）不会存储这么大的整数。<br>
那么计算varint编码后的长度size函数就显而易见了:

```
// 计算编码之后的大小,无非是从第一个字节开始,看哪个字节的
// 最高位=0,那么就结束
//
func sizeVarint(x uint64) (n int) {
	for {
		n++
		x >>= 7
		// 最高位=0,说明是最后一个字节
		if x == 0 {
			break
		}
	}
	return n
}
```

<font color=red size=18>特别注意:</font> 这里有一对奇葩类型是sint32 sint64,它们不是将原始的数据进行varint编码, 而是采用的Zigzag方法!(WTF?)
拿sint64为例子:

```
// EncodeZigzag64编码很有意思, 它是编码有符号的sint64,
// 并且是正负数交替编码, 也就是Zigzag名称由来
// 0  -编码为-> 0
// -1 -编码为-> 1
// 1  -编码为-> 2
// ...
// 使用的是算法很简单: EncodeVarint((x<<1) ^ (x>>63))
// 其内部使用的还是Varint编码, 只不过编码的数用的是Zigzag64编码过的
//
// 下面这个((x<<1) ^ (x>>63))计算很有意思, 其实我写的这个式子是不完整的
// 还需要加上(uint64)(x<<1) ^ (uint64)(x>>63)
// 位运算不好解释啊,先举个例子-1:
// -1的64位表示: 1111111111111111111111111111111111111111111111111111111111111111
// -1<<1      : 1111111111111111111111111111111111111111111111111111111111111110
// -1>>63     : 1111111111111111111111111111111111111111111111111111111111111111
//
// 1.注意这里的shift是"算术移动",不是"逻辑移动", 不是很清楚的去google
// 2.注意有符号和无符号的位表示区别, 无符号->有符号需要"取反+1"
//   10000000..1 ---> 取反+1 ----> 11111..111  (符号位不动)
//
func (p *Buffer) EncodeZigzag64(x uint64) error {
	//
	// 不是使用x进行varint编码, 而是使用Zigzag之后的数据进行编码
	//
	return p.EncodeVarint(uint64((x << 1) ^ uint64((int64(x) >> 63))))
}

// 获取ZigZag编码数据长度
func sizeZigzag64(x uint64) int {
	return sizeVarint(uint64((x << 1) ^ uint64((int64(x) >> 63))))
}
```
这个还是很有意思的~~~Orz...


<br>
#####2.1.2 Bytes类型编码

Bytes类型的编码很简单: 长度 + 数据字节. 注意长度字段使用的也是varint编码<br>

```
// raw编码, 用于bytes和内嵌msg类型
// 编码规则: 长度 + 数据字节流
// 长度采用uint64编码为Varint类型, 后面跟着bytes数据
//
func (p *Buffer) EncodeRawBytes(b []byte) error {
    // 长度字段使用varint编码
	p.EncodeVarint(uint64(len(b)))
	// 将长度直接放在数据buf后面
	p.buf = append(p.buf, b...)
	return nil
}

// string和上面的bytes的编码是一样的
//
func (p *Buffer) EncodeStringBytes(s string) error {
    // 同上
	p.EncodeVarint(uint64(len(s)))
	p.buf = append(p.buf, s...)
	return nil
}

// Bytes计算长度函数size比较简单
// 其实就是编码后的len(数据)长度 + 实际数据长度
func sizeStringBytes(s string) int {
	return sizeVarint(uint64(len(s))) +
		len(s)
}
```

<br>
#####2.1.3 WireFixed64类型编码

Fixed64用的是固定8字节编码, 那么其size函数其实就是8这么简单:

```
// EncodeFixed64编码写入固定长度8字节(fixed64, sfixed64, and double)
// 注意: 同样是小端序存储数据
func (p *Buffer) EncodeFixed64(x uint64) error {
	p.buf = append(p.buf,
		uint8(x),
		uint8(x>>8),
		uint8(x>>16),
		uint8(x>>24),
		uint8(x>>32),
		uint8(x>>40),
		uint8(x>>48),
		uint8(x>>56))
	return nil
}

// 返回Fixed64长度, 固定8字节
func sizeFixed64(x uint64) int {
	return 8
}
```

<br>
#####2.1.4 WireFixed32类型编码

和WireFixed64是类似的, 不多说了:

```
// EncodeFixed32编码写入固定长度4字节(fixed32, sfixed32, and float)
//
func (p *Buffer) EncodeFixed32(x uint64) error {
	p.buf = append(p.buf,
		uint8(x),
		uint8(x>>8),
		uint8(x>>16),
		uint8(x>>24))
	return nil
}

// 返回Fixed32长度, 固定4字节
func sizeFixed32(x uint64) int {
	return 4
}
```


<br>
#####2.1.5 结构体类型编码

这个本来不应该放在这个level目录下来说, 因为结构体编码本质上Bytes编码. 但是比较蛋疼, 还是单独说一下吧.

```
// Encode a message struct.
func (o *Buffer) enc_struct_message(p *Properties, base structPointer) error {
	var state errorState
	structp := structPointer_GetStructPointer(base, p.field)
	if structPointer_IsNil(structp) {
		return ErrNil
	}

	// Can the object marshal itself?
	// 如果struct自己实现了序列化函数, 那么执行自己的函数就OK
	if p.isMarshaler {
		m := structPointer_Interface(structp, p.stype).(Marshaler)
		data, err := m.Marshal()
		if err != nil && !state.shouldContinue(err, nil) {
			return err
		}
		// 将type和数据放入
		o.buf = append(o.buf, p.tagcode...)
		//
		// 默认情况下还是使用Bytes编码(长度+字节流)
		//
		o.EncodeRawBytes(data)
		return state.err
	}

    // 如果没有实现这个接口, 那么使用统一方法处理
    // 首先放入tag+type编码后的tagcode字段, 然后放入编码后的数据
	o.buf = append(o.buf, p.tagcode...)
	// 如果没有实现, 那么使用下面方法
	return o.enc_len_struct(p.sprop, structp, &state)
}

// Encode a struct, preceded by its encoded length (as a varint).
//
// 对一个struct进行编码
// @param1: struct字段
// @param2: pb结构指针
// @param3: 错误状态
//
func (o *Buffer) enc_len_struct(prop *StructProperties, base structPointer, state *errorState) error {
	return o.enc_len_thing(func() error { return o.enc_struct(prop, base) }, state)
}
// Encode something, preceded by its encoded length (as a varint).
func (o *Buffer) enc_len_thing(enc func() error, state *errorState) error {
	iLen := len(o.buf)
	// 预留4B长度给length
	o.buf = append(o.buf, 0, 0, 0, 0) // reserve four bytes for length
	iMsg := len(o.buf)
	err := enc()
	if err != nil && !state.shouldContinue(err, nil) {
		return err
	}
	lMsg := len(o.buf) - iMsg
	lLen := sizeVarint(uint64(lMsg))
	switch x := lLen - (iMsg - iLen); {
	case x > 0: // actual length is x bytes larger than the space we reserved
		// Move msg x bytes right.
		o.buf = append(o.buf, zeroes[:x]...)
		copy(o.buf[iMsg+x:], o.buf[iMsg:iMsg+lMsg])
	case x < 0: // actual length is x bytes smaller than the space we reserved
		// Move msg x bytes left.
		copy(o.buf[iMsg+x:], o.buf[iMsg:iMsg+lMsg])
		o.buf = o.buf[:len(o.buf)+x] // x is negative
	}
	// Encode the length in the reserved space.
	o.buf = o.buf[:iLen]
	//
	// 最终还是使用length + bytes编码
	//
	o.EncodeVarint(uint64(lMsg))
	o.buf = o.buf[:len(o.buf)+lMsg]
	return state.err
}
```

<br>
#####2.1.6 repeated类型字段编码

简单说就是数组(或者slice)编码.
当然这个repeat的字段的类型又可以是上面那些所有的类型, 所以呀, 前后标志, 然后加上之前的那些编码, 就构成了repeat的字段方法.
此处以一个简单的bool repeat值为例子:

```
// Encode a slice of bools ([]bool).
func (o *Buffer) enc_slice_bool(p *Properties, base structPointer) error {
	s := *structPointer_BoolSlice(base, p.field)
	l := len(s)
	if l == 0 {
		return ErrNil
	}
	// 处理所有的数据
	for _, x := range s {
	    // 对于每一个数进行单独编码...
	    // 有木有觉得这里很不爽...
		o.buf = append(o.buf, p.tagcode...)
		v := uint64(0)
		if x {
			v = 1
		}
		p.valEnc(o, v)
	}
	return nil
}
```
看上面的注释, 一定会有你觉得不爽的地方! 是的! 这个slice是相同类型的数据, why每个数据都需要加一个tagcode呢?没必要对不对呀!<br>
在 2.1.0版本之后, 加入了[packed=true]字段, 这些数据, 会保存在相同的一个k-v下, 而不是每一个都保存一遍.
只不过需要加上实际的数据的个数!

```
func (o *Buffer) enc_slice_packed_bool(p *Properties, base structPointer) error {
	s := *structPointer_BoolSlice(base, p.field)
	l := len(s)
	if l == 0 {
		return ErrNil
	}
	// 记录tagcode
	o.buf = append(o.buf, p.tagcode...)
	// 记录个数
	o.EncodeVarint(uint64(l)) // each bool takes exactly one byte
	// 下面仅仅记录每个数值
	for _, x := range s {
		v := uint64(0)
		if x {
			v = 1
		}
		p.valEnc(o, v)
	}
	return nil
}
```


<br>
####2.2 怎样确定数据属于哪种编码

这个其实是protobuf compiler来决定的, 也就是, 从XXX.proto文件生成XXX.pb.go这个过程中就已经决定了的, 例如生成如下结构:

```
type Error struct {
	Code             *ErrorCode `protobuf:"varint,1,opt,name=code,enum=base.ErrorCode,def=0"`
	Detail           *string    `protobuf:"bytes,2,opt,name=detail"`
	XXX_unrecognized []byte     `json:"-"`
}
```
我们可以很明显看到, 每个字段后面的protobuf标签下面, 存在一些属性, 拿`protobuf:"varint,1,opt,name=code,enum=base.ErrorCode,def=0"`为例,
第一个表明这个字段是varint类型, 1表示tag是1, opt表示是可选类型(还有require类型), 名称是code,值是枚举值base.ErrorCode,默认值是0.
所以暂时不关心这个protobuf compiler.<br>
不过我们需要知道, 在定义一个类型之后, 会做一些Init动作, 用于根据不同的类型指定不同的编解码函数, 具体的可以从proto/properties.go文件中Init函数开始看:

```
// init初始化函数
func (p *Properties) init(typ reflect.Type, name, tag string, f *reflect.StructField, lockGetProp bool) {
    ...
	// 说白了就是解析这个"varint,4,opt,name=from"字符串, 同时根据不同的数据类型指定不同的编解码函数
	// 同时还解析了其他的一些参数
	p.Parse(tag)
	// 设置这个字段的编解码函数
	// 注意这个编解码函数和上面的是不一样的, 上面的其实是设置了具体的value的编解码函数,
	// 此处的仅仅是一个包装函数, 最终还是需要执行value的编解码函数
	p.setEncAndDec(typ, f, lockGetProp)
    ...
}


// 根据数据类型解析,并指定编解码函数
// 同时解析其他的一些参数
func (p *Properties) Parse(s string) {
	// "bytes,49,opt,name=foo,def=hello!"
	// 类型,tag,可选/必选,name,默认值
	// 根据','分割
	fields := strings.Split(s, ",") // breaks def=, but handled below.
	if len(fields) < 2 {
		fmt.Fprintf(os.Stderr, "proto: tag has too few fields: %q\n", s)
		return
	}

	// 1. 第一个字段: 数据类型
	p.Wire = fields[0]
	// 根据不同的类型进行赋值

	//
	// 下面对于不同的数据类型赋值相应的函数
	// 根据数据类型Wire来指定编解码函数
	//
	// 下面根据不同的数据类型, 赋值不同的编码解码函数以及获取编码后size函数
	//
	switch p.Wire {
	case "varint":
		// 例如如果是"varint"类型, 那么这个value函数如下
		p.WireType = WireVarint
		p.valEnc = (*Buffer).EncodeVarint
		p.valDec = (*Buffer).DecodeVarint
		p.valSize = sizeVarint
	case "fixed32":
		p.WireType = WireFixed32
		p.valEnc = (*Buffer).EncodeFixed32
		p.valDec = (*Buffer).DecodeFixed32
		p.valSize = sizeFixed32
	case "fixed64":
		p.WireType = WireFixed64
		p.valEnc = (*Buffer).EncodeFixed64
		p.valDec = (*Buffer).DecodeFixed64
		p.valSize = sizeFixed64
	case "zigzag32":
		p.WireType = WireVarint
		p.valEnc = (*Buffer).EncodeZigzag32
		p.valDec = (*Buffer).DecodeZigzag32
		p.valSize = sizeZigzag32
	case "zigzag64":
		p.WireType = WireVarint
		p.valEnc = (*Buffer).EncodeZigzag64
		p.valDec = (*Buffer).DecodeZigzag64
		p.valSize = sizeZigzag64
	case "bytes", "group":
		p.WireType = WireBytes
		// no numeric converter for non-numeric types
	default:
		fmt.Fprintf(os.Stderr, "proto: tag has unknown wire type: %q\n", s)
		return
	}

	// 2. 下面解析第二个字段tag, 例如: Int Count = 3 'json:"ssd"'
	// 那么这里的Tag = 3
	var err error
	// 注意此处的Tag是自己定义的额! ! !与order是不一样的
	p.Tag, err = strconv.Atoi(fields[1])
	if err != nil {
		return
	}

	// 3. 下面解析后面所有的字段
	for i := 2; i < len(fields); i++ {
		f := fields[i]
		switch {
		// 可选 必选字段
		case f == "req":
			p.Required = true
		case f == "opt":
			p.Optional = true
		case f == "rep":
			p.Repeated = true
		case f == "packed":
			p.Packed = true
		// 解析name字段
		case strings.HasPrefix(f, "name="):
			p.OrigName = f[5:]
		case strings.HasPrefix(f, "json="):
			p.JSONName = f[5:]
		case strings.HasPrefix(f, "enum="):
			p.Enum = f[5:]
		case f == "proto3":
			p.proto3 = true
		case f == "oneof":
			p.oneof = true
		// 解析默认值字段
		case strings.HasPrefix(f, "def="):
			p.HasDefault = true
			p.Default = f[4:] // rest of string
			if i+1 < len(fields) {
				// Commas aren't escaped, and def is always last.
				p.Default += "," + strings.Join(fields[i+1:], ",")
				break
			}
		case strings.HasPrefix(f, "embedded="):
			p.OrigName = strings.Split(f, "=")[1]
		case strings.HasPrefix(f, "customtype="):
			p.CustomType = strings.Split(f, "=")[1]
		}
	}
}

// 这个函数比较大, 摘入一部分代码
// 所做的工作包括:
// 设置三个函数: 编码,解码,获取size大小
// p.enc, p.dec, p.size
// 同时设置了tag+type, 即调用前面说的setTag函数
//
func (p *Properties) setEncAndDec(typ reflect.Type, f *reflect.StructField, lockGetProp bool) {
	// 初始化编码,解码,返回编码后大小  三个函数 = nil
    ...
    switch t1 := typ; t1.Kind() {
   	default:
   		fmt.Fprintf(os.Stderr, "proto: no coders for %v\n", t1)

   	// proto3 scalar types
    // 下面根据不同的数据类型, 赋值不同的编解码函数, 这个函数, 其实最终还是调用的之前
    // 在Parse函数中设置的value的编解码函数的~~~
    case reflect.Bool:
   		if p.proto3 {
   			p.enc = (*Buffer).enc_proto3_bool
   			p.dec = (*Buffer).dec_proto3_bool
   			p.size = size_proto3_bool
   		} else {
   			p.enc = (*Buffer).enc_ref_bool
   			p.dec = (*Buffer).dec_proto3_bool
   			p.size = size_ref_bool
   		}

    ...
}



// 此处以一个enc_proto3_bool函数为例子
func (o *Buffer) enc_proto3_bool(p *Properties, base structPointer) error {
	v := *structPointer_BoolVal(base, p.field)
	if !v {
		return ErrNil
	}
	o.buf = append(o.buf, p.tagcode...)
	//
	// 下面实际调用的是valEnc函数, 这个函数在func (p *Properties) Parse(s string)中被赋值
	//
	p.valEnc(o, 1)
	return nil
}

```

<br>
####2.3 编码基本过程(函数调用)

最后讲一下大的框架, 其基本过程如下:
1 -> 2 -> 3 -> ...

```
// 1
func Marshal(pb Message) ([]byte, error) {
    ...
}

// 2
func (p *Buffer) Marshal(pb Message) error {
    ...
}

// 3
func (o *Buffer) enc_struct(prop *StructProperties, base structPointer) error {
    ...
    // 编码(序列化)是按照tag的顺序进行的, 解码的时候会根据tag进行相应的优化处理
   	// 此处的tag是按照字段顺序的那个idx
   	//
   	for _, i := range prop.order {
   		// 获取一个字段属性
   		p := prop.Prop[i]
   		// 编码函数是否存在
    	if p.enc != nil {
    		// 如果存在, 那么对字段进行编码
    		// default: 会根据不同的类型赋值不同的编码函数, 在properties.go中的setEncAndDec函数中赋值
    		//
    		// 下面这个函数在init函数中根据不同的数据类型被赋值过, 详细见2.2 !
    		//
    		err := p.enc(o, p, base)
    		if err != nil {
    			if err == ErrNil {
    				if p.Required && state.err == nil {
    					state.err = &RequiredNotSetError{p.Name}
    				}
    			} else if err == errRepeatedHasNil {
    				// Give more context to nil values in repeated fields.
   					return errors.New("repeated field " + p.OrigName + " has nil element")
    			} else if !state.shouldContinue(err, p) {
   					return err
   				}
   			}
   		}
   	}
    ...
}
```

OK, 至此, 结合以上所有, 编解码的基本过程算是搞懂了~
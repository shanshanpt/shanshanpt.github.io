---
layout: post
title: Protobuf 解码过程
category: 技术
tags: protobuf
keywords:
description:
---

###1. 解码过程

昨天已经将<a href="http://shanshanpt.github.io/2016/09/10/protobuf-encode.html"  target="_blank">编码过程</a>和规则讲清楚了, 那么解码其实就是逆向过程而已.
下面从解码过程的函数调用开始理清思路: 首先从入口函数Unmarshal开始

```
// ---> 1
func (p *Buffer) Unmarshal(pb Message) error {
	// If the object can unmarshal itself, let it.
	// 如果实现了解码函数, 那么自己处理即可
	if u, ok := pb.(Unmarshaler); ok {
		err := u.Unmarshal(p.buf[p.index:])
		p.index = len(p.buf)
		return err
	}

    // 下面这个函数比较重要, 目的是获取pb的反射类型以及反射value指针
    //
	typ, base, err := getbase(pb)
	if err != nil {
		return err
	}

    // 下面根据反射类型来对数据进行解码
	err = p.unmarshalType(typ.Elem(), GetProperties(typ.Elem()), false, base)

	if collectStats {
		stats.Decode++
	}

	return err
}


// ---> 2
// 大概的解码步骤如下:
// 1: 解码tagcode
// 2: 获取tag, 并通过tag获取结构体字段
// 3: 获取解码函数并解码
// 4: 判断required字段是不是都赋值完毕
func (o *Buffer) unmarshalType(st reflect.Type, prop *StructProperties, is_group bool, base structPointer) error {
	var state errorState
	// 首先获取rquest字个数
	required, reqFields := prop.reqCount, uint64(0)

	var err error
	// index表示的是读写指针的位置, 如果o.index < len(o.buf)
	// 说明这个buf数据还没有处理完
	// 循环处理每个字段
	for err == nil && o.index < len(o.buf) {
		oi := o.index
		var u uint64
		// 首先解码一个varint,
		// 是 tagcode : 确定数据tag和类型
		u, err = o.DecodeVarint()
		if err != nil {
			break
		}
		// tag和type一起编码的~
		// 下3bits是数据类型
		// 数据类型包括哪些, 在编码过程中有说过
		wire := int(u & 0x7)
		if wire == WireEndGroup {
			if is_group {
				return nil // input is satisfied
			}
			return fmt.Errorf("proto: %s: wiretype end group for non-group", st)
		}
		// 右移3bits, 那么现在留下来的是tag字段
		// tag必须从1开始
		tag := int(u >> 3)
		if tag <= 0 {
			return fmt.Errorf("proto: %s: illegal tag %d (wire type %d)", st, tag, wire)
		}
		//
		// 下面这个是通过tag获取具体的属性字段在prop.Prop[]中的index
		// 所有的属性具体细节存在prop.Prop[]中
		// 这里其实是存在一个tagMap映射表, 目的是为了最快速度找到对应的字段
		//
		// 肯定有人很好奇why会有这一步???这是因为protobuf的字段的存储是按照tag从小到大来的,
		// 并不是字段在结构体中的定义顺序!
		// struct XXX {
		// 	 a int = 2;
		//   b int = 1;
		// }
		// 那么编码的时候, 其实b是在a之前进行的!
		// 所以在此处做了一个tagMap映射表, 表示通过当前的tag的字段获取prop.Prop[]
		// 中的实际字段位置, 具体例子可以看func getPropertiesLocked(t reflect.Type) *StructProperties {}
		//
		fieldnum, ok := prop.decoderTags.get(tag)
		//
		// 如果没有找到对应的index, 那么可能是extend或者oneof字段
		//
		if !ok {
			// Maybe it's an extension?
			if prop.extendable {
				if e := structPointer_Interface(base, st).(extendableProto); isExtensionField(e, int32(tag)) {
					if err = o.skip(st, tag, wire); err == nil {
						if ee, eok := e.(extensionsMap); eok {
							ext := ee.ExtensionMap()[int32(tag)] // may be missing
							ext.enc = append(ext.enc, o.buf[oi:o.index]...)
							ee.ExtensionMap()[int32(tag)] = ext
						} else if ee, eok := e.(extensionsBytes); eok {
							ext := ee.GetExtensions()
							*ext = append(*ext, o.buf[oi:o.index]...)
						}
					}
					continue
				}
			}
			// Maybe it's a oneof?
			if prop.oneofUnmarshaler != nil {
				m := structPointer_Interface(base, st).(Message)
				// First return value indicates whether tag is a oneof field.
				ok, err = prop.oneofUnmarshaler(m, tag, wire, o)
				if err == ErrInternalBadWireType {
					// Map the error to something more descriptive.
					// Do the formatting here to save generated code space.
					err = fmt.Errorf("bad wiretype for oneof field in %T", m)
				}
				if ok {
					continue
				}
			}
			err = o.skipAndSave(st, tag, wire, base, prop.unrecField)
			continue
		}

		// 获取属性字段
		p := prop.Prop[fieldnum]

		// 没有对应的解码函数, 处理不了
		if p.dec == nil {
			fmt.Fprintf(os.Stderr, "proto: no protobuf decoder for %s.%s\n", st, st.Field(fieldnum).Name)
			continue
		}

		// 获取解码函数
		dec := p.dec
		if wire != WireStartGroup && wire != p.WireType {
			if wire == WireBytes && p.packedDec != nil {
				// a packable field
				dec = p.packedDec
			} else {
				err = fmt.Errorf("proto: bad wiretype for field %s.%s: got wiretype %d, want %d", st, st.Field(fieldnum).Name, wire, p.WireType)
				continue
			}
		}

		// 对数据进行解码
		// 这里的解码函数, 在编码中已经说过:
		// 在初始化的时候会根据数据的类型赋值相应的编码解码函数
		//
		decErr := dec(o, p, base)
		if decErr != nil && !state.shouldContinue(decErr, p) {
			err = decErr
		}
		// 处理一个一个required字段
		if err == nil && p.Required {
			// Successfully decoded a required field.
			if tag <= 64 {
				// use bitmap for fields 1-64 to catch field reuse.
				var mask uint64 = 1 << uint64(tag-1)
				if reqFields&mask == 0 {
					// new required field
					reqFields |= mask
					required--
				}
			} else {
				// This is imprecise. It can be fooled by a required field
				// with a tag > 64 that is encoded twice; that's very rare.
				// A fully correct implementation would require allocating
				// a data structure, which we would like to avoid.
				required--
			}
		}
	}
	if err == nil {
		if is_group {
			return io.ErrUnexpectedEOF
		}
		if state.err != nil {
			return state.err
		}
		// 存在一些required的字段没有处理!!!
		if required > 0 {
			// Not enough information to determine the exact field. If we use extra
			// CPU, we could determine the field only if the missing required field
			// has a tag <= 64 and we check reqFields.
			return &RequiredNotSetError{"{Unknown}"}
		}
	}
	return err
}
```


###2. 一些解码函数

####2.1 varint解码函数

```
// 解码Varint过程
// 编码过程的逆过程而已~~~
func (p *Buffer) DecodeVarint() (x uint64, err error) {
	// x, err already 0
	// 获取当前读取数据位置index
	i := p.index
	// buf总长度
	l := len(p.buf)

	for shift := uint(0); shift < 64; shift += 7 {
		// 如果读取位置超过总长度, 那么显然是index溢出
		if i >= l {
			err = io.ErrUnexpectedEOF
			return
		}
		// 获取一个Byte数据
		b := p.buf[i]
		i++
		// 下面这个分成三步走:
		// 1: uint64(b) & 0x7F 获取下7bits有效数据
		// 2: (uint64(b) & 0x7F) << shift 由于是小端序, 所以每次处理一个Byte数据, 都需要向高位移动7bits
		// 3: 将数据x和当前的这个字节数据 | 在一起
		x |= (uint64(b) & 0x7F) << shift
		// 如果 b < 0x80 说明最高位不是1, 所以说明是最后一个字节
		if b < 0x80 {
			p.index = i
			return
		}
	}

	// The number is too large to represent in a 64-bit value.
	err = errOverflow
	return
}
```

还有一些其他的解码函数, 具体再去proto/decoder.go中去查看...

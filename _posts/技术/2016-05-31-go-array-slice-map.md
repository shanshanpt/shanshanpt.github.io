---
layout: post
title: Go语言 数组(Array), 分片(Slice), Map 以及 Set
category: 技术
tags: GO
keywords:
description:
---

今天主要总结一下Go语言的几个基本的结构数组, 分片以及Map.
很长时间, 一直认为Array和Slice是一样的, 真傻@_@, 其实这两个差的还是挺多的.
下面具体看一下:

###1. Array

(1). Go语言中的Array和C/C++中的Array也有很大的区别, C/C++中的数组名本质上是这一段连续数组空间的首地址, 所以在传递数组参数的时候,
其实是传递一个地址. 而在Go中, 传递数组其实是传递整个数组的copy, 所以代价比较大. 同时如果你想要在调用函数中修改数组的值, 那么你
直接传递数组也是 不OK 的. 这种情况下其实是可以显示的传入数组地址.

```
func main() {
    b := [3]int{1, 2, 3}
    f2(&b)
    fmt.Println(b)
}

func f2(b *[3]int)  {
	b[0] = 11
	b[1] = 22
	b[2] = 33
}
```

显示传入数组地址是能达到效果的. 如果你想要方面, 那么还不如使用下面的Slice. <br>

(2). 不同大小, 不同类型之间的数组是不能进行赋值的. 例如:

```
func main() {
	var array3 [3]*string
	array4 := [3]*string{new(string), new(string), new(string)}
	*array4[0] = "Red"
	*array4[1] = "Blue"
	*array4[2] = "Green"
    // 赋值OK
	array3 = array4
	// 大小错误
	var array31 [4]*string
	array31 = array4
	// 类型错误
	var array32 [3]string
	array32 = array4
}
```

(3). 多维数组也可以的, 例如:

```
func main() {
	array5 := [4][2]int{ {10, 11}, {20, 21}, {30, 31}, {40, 41} }
	fmt.Println(array5)

	var array6 [2][2]int
	var array7 [2][2]int
	array6[0][0] = 0
	array6[0][1] = 1
	array6[1][0] = 2
	array6[1][1] = 3
	// 赋值
	array7 = array6
	fmt.Println(array7)
	// copy单独的维度 ~
	var array8 [2]int
	array8 = array6[0]
	fmt.Println(array8)
}
```

数组相对于下面的Slice, 灵活性会差一点, 所以感觉大部分时候使用Slice会更多一些. <br>

###2. Slice

Slice的一般声明形式是: ```var s []int```, 不像数组, Slice是不指定数组大小的, 会根据实际情况进行分配. <br>
Slice的空间扩容分配规则: 创建底层数组时，当元素个数小于1000, 容量扩增为现有元素的2倍，如果元素个数超过1000，那么容量会以 1.25 倍增长。 <br>
注意: Array的拷贝或者传参数的本质是copy整个数组, 而Slice是操作地址! 看下面一个例子:

```
func main() {
	slice1 := []int{1,2,3,4,5}
	// TODO: 注意,下面这种slice是共享内存的,并不是copy
	slice2 := slice1[2:4]
	fmt.Println(slice1, slice2)
	slice2[0] = 333
	// 输出1 2 333 4 5
	fmt.Println(slice1)
}
```
上面的Slice1和Slice2共享内存, 任何一个改变了数据, 另一个都会发生变化. <br>
注意: 此处有一个"坑", 看下面一段代码, 想想输出什么:

```
func main() {
	slice1 := []int{1,2,3,4,5}
	slice2 := slice1[2:4]
	slice2 = append(slice2, 66)
    fmt.Println(slice1, slice2)
}
```
当然slice1和slice2输出的结果是一样的这一点是之前已经讲过, 但是具体输出什么呢?
显然结果不是1 2 3 4 5 66, 输出的结果是: 1 2 3 4 66. 其中5被66覆盖了.
slice2是slice1[2:4], 事实上可以输出cap(slice2)看看"分配"(实际是共享空间)的空间大小是多大.
可以发现是从slice1[2]之后的空间都是和slice2共享的, 所以cap(slice2)=3. 所以此时如果slice2 = append(slice2, 66)
那么会覆盖最后一个5. 为了解决这个问题, 需要引入slice的第三个参数来指定共享结束位置, 所以将slice2改成:
```slice2 := slice1[2:4:4]```, 那么实际的cap(slice2)=2, 仅仅和slice1共享3,4两个数. 此时如果使用slice2 = append(slice2, 66),
那么会造成空间不足会重新分配空间, 那么slice1输出的是: 1 2 3 4 5, slice2输出的是3 4 66.<br>

append是可变参数, 所以可以写成以下形式:

```
func main() {
    var slice []string
	source = []string{"apple", "orange", "plum", "banana", "grape"}
	slice = append(slice, source...)
}
```

slice可以有多维, 形式如: ```slice6 := [][]int{ {10}, {20, 30} }```, 每个维度之间也是互不影响的.
例如: ```slice6[0] = append(slice6[0], 20)```, 如果slice[0]需要重新创建底层数组，不会影响到slice[1]. <br>


<font color=#0099ff>注意1</font>: 传递slice参数时, 在64位的机器上，slice 需要24字节的内存，其中指针部分需要8字节，长度和容量也分别需要8字节。<br>
<font color=#0099ff>注意2</font>: slice作为参数时, 传递的是地址, 所以函数内部的改变会被直接生效.


###3. Map


Map可以认为是类似于hash表或者字典等结构, 它是一种集合，所以我们可以像迭代数组和 slice 那样迭代它。
不过，map 是无序的，无法决定它的返回顺序，这是因为 map 是使用 hash 表来实现的。
map 的 hash 表包含了一个桶集合(collection of buckets)。当我们存储，移除或者查找键值对(key/value pair)时，都会从选择一个桶开始。
在映射(map)操作过程中，我们会把指定的键值(key)传递给 hash 函数(又称散列函数)。hash 函数的作用是生成索引，索引均匀的分布在所有可用的桶上。
<br>

对于slice, 我们通过var s []int声明之后, 就可以直接使用s了, 但是map不可以, 即```var dict map[string]int```后, dict还是不能直接使用,
必须要初始化, 有如下几种方法: ```dict := make(map[string]int)```, ```dict := map[string]string{"AA": "aa", "BB": "bb"}```.
然后就可以操作map了, 例如 ```dict["CC"] = "cc"```.<br>

<font color=#0099ff>注意1</font>: 不初始化 map，那么就会创建一个 nil map。nil map 不能用来存放键值对，否则会报运行时错误.<br>
<font color=#0099ff>注意2</font>: slice，function 和 包含 slice 的 struct 类型不可以作为 map 的键，否则会编译错误! <br>

关于Map的返回值, 有两种情况:

```
func main() {
	dict := make(map[string]int)
	dict["AAA"] = 333
	dict["BBB"] = 666
	dict["CCC"] = 999
	// map返回值有两种情况,第一种是仅仅返回值,第二是返回值和exist-bool值
	d := dict["AAA"]
	if (d != "") {
		fmt.Println(d)
	}
	// 通过第二个参数判断这个key是否存在
	d, exist := dict1["AAA"]
	if exist {
		fmt.Println(d)
	}
}
```

关于Map的遍历, 如下:

```
// 返回的是key和value
for key, value := range dict {
	fmt.Printf("Key: %s  Value: %s\n", key, value)
}

// 对于slice或者数组的遍历, 返回的index和value

```

同时, 可以使用```delete(dict, "AAA")```方法来删除元素. <br>

<font color=#0099ff>注意3</font>: 在函数间传递map, 传递的是引用。所以如果我们在函数中改变了 map，那么所有引用 map 的地方都会改变.


###4. Set

Set可以通过Map来实现, 具体的代码见:
<a href="http://shanshanpt.github.io/2016/05/31/go-set.html" target="_blank">Go Set</a>














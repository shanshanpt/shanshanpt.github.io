---
layout: post
title: Mongodb 中 _id (ObjectId) 设计思路
category: 技术
tags: Mongodb
keywords:
description:
---

作为mongodb fresh, 已经被mongodb 的 ObjectId坑了两次, 再不吸取教训, 我就可以收拾收拾回家了, Orz...<br>

在之前的一次设计中, 我给一个collection增加了一个timestamp字段, 用于记录一条记录生成的时间, 并且想着可以根据时间字段
进行一些查询. 刚刚开始, 一切都在我意料之中, 程序运行完好~ 忽然有一天, 运营的人找我来了, XXX, 你这程序不行了, 不出结果.
卧槽...哔了狗了, 运行几个月都没有问题, 你现在说有问题, 当然, 为了展示我的绅士风度, 我还是帮他查了下原因, 呵呵, 当场自己
打脸 (￣ε(#￣)☆╰╮(￣▽￣///). error: mongodb io time out. 这显然是根据timestamp字段查询的问题, 我当时立马想到是
没有加索引, 所以觉得很开心的解决了问题, 这时候正好被老司机看到. 连忙打住我, 小伙子, _id字段自带时间索引, 你这样做多不优雅...
呵呵, 呵呵... 老司机教做人啊. 这也印证了自己还仅仅是一只低级的菜鸟! OK, 下面进入正题吧.<br>

在一个特定的collection中，需要唯一的标识文档, 因此MongoDB中存储的文档都由一个"_id"键，用于完成此功能。
这个键的值可以是任意类型的，默认试ObjectId(string)对象。<br>

考虑分布式问题, “_id”要求不同的机器都能用全局唯一的同种方法方便的生成它。因此不能使用自增主键，mongodb的生成ObjectId对象的方法如下:<br>

ObjectId使用12字节的存储空间，结构如下：<br>

![1](/public/img/grocery/mongo/mongo-2.png  "ObjectId")<br>

> 1). 前四个字节时间戳是从标准纪元开始的时间戳，单位为秒. 它保证插入顺序大致按时间排序; 隐含了文档创建时间. <br>
> 2). 接下来的三个字节是所在主机的唯一标识符，一般是机器主机名的散列值，这样就确保了不同主机生成不同的机器hash值，确保在分布式中不造成冲突.
  所以在同一台机器中, 生成的objectid中这部分字符串都是一样。<br>
> 3). 上面的机器码是为了确保在不同机器产生的objectid不冲突，而pid就是为了在同一台机器不同的mongodb进程产生了objectid不冲突。<br>
> 4). 前面的九个字节是保证了一秒内不同机器不同进程生成objectid不冲突，最后的三个字节是一个自动增加的计数器，用来确保在同一秒内产生的objectid也不会发现冲突。<br>


综上: 时间戳保证秒级唯一; 机器ID保证设计时考虑分布式，避免时钟同步; PID保证同一台服务器运行多个mongod实例时的唯一性; 最后的计数器保证同一秒内的唯一性。 <br>

OK, 那么根据上面的规则, 我们可以很容易写出生成ObjectId的代码, 示例Go代码如下:

```
// NewObjectId returns a new unique ObjectId.
func NewObjectId() ObjectId {
	var b [12]byte
	// Timestamp, 4 bytes, big endian
	binary.BigEndian.PutUint32(b[:], uint32(time.Now().Unix()))
	// Machine, first 3 bytes of md5(hostname)
	b[4] = machineId[0]
	b[5] = machineId[1]
	b[6] = machineId[2]
	// Pid, 2 bytes, specs don't specify endianness, but we use big endian.
	pid := os.Getpid()
	b[7] = byte(pid >> 8)
	b[8] = byte(pid)
	// Increment, 3 bytes, big endian
	i := atomic.AddUint32(&objectIdCounter, 1)
	b[9] = byte(i >> 16)
	b[10] = byte(i >> 8)
	b[11] = byte(i)
	return ObjectId(b[:])
}
```

那如果我们想要根据_id的时间戳来进行查询(注意是秒级别以上), 那么我们仅仅需要填充前面4个字节的时间部分, 后面的置0就OK.

```
// NewObjectIdWithTime returns a dummy ObjectId with the timestamp part filled
// with the provided number of seconds from epoch UTC, and all other parts
// filled with zeroes. It's not safe to insert a document with an id generated
// by this method, it is useful only for queries to find documents with ids
// generated before or after the specified timestamp.
func NewObjectIdWithTime(t time.Time) ObjectId {
	var b [12]byte
	binary.BigEndian.PutUint32(b[:4], uint32(t.Unix()))
	return ObjectId(string(b[:]))
}
```

如果要查询这个时间之后的数据, 那么 ```db.XXX.find({"_id": {"$gt": NewObjectIdWithTime(time)}})``` 就可以了. <br>


关于分布式ID的唯一性问题, 可以参考以下链接: <br>
<a href="http://blog.csdn.net/xiamizy/article/details/41521025" target="_blank">MongoDB中ObjectId的误区，以及引起的一系列问题</a> <br>
<a href="http://blog.csdn.net/solstice/article/details/6285216" target="_blank">分布式系统中的进程标识</a>







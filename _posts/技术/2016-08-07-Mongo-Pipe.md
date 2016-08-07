---
layout: post
title: Mongodb 聚合管道（Aggregation Pipeline）
category: 技术
tags: Mongodb
keywords:
description:
---

###1.Mongodb 管道概念<br>
Mongodb pipe从V2.2版本开始引入，它类似于数据处理的管道。大家应该都知道Linux下的管道, 例如```cat xxx.log | grep "xxx"```, 即前面的执行语句的结果作为
下一条命令的输入, Mongo Pipe其实也是类似的. Mongo Pipe有很强大的功能, 可以对数据进行筛选, 计算, 分组等等. <br>

基本的定义是: ```db.collection.aggregate(pipeline, options)```, 看下面一个例子:

```
db.msg.aggregate([
    {"$match": bson.M{"from": 10000, "to": bson.M{"$in": userIDs}}},
    {"$sort": bson.M{"timestamp": 1}},
    {"$group": bson.M{"_id": "$to", "count": bson.M{"$sum": "$to"}}},
    ]
)
```

上面有三条命令:

- 第一条命令式使用match筛选一些文档 <br>
- 第二条命令是将第一条名的输出的那些文档按照timestamp字段进行增序排序 <br>
- 第三条命令是将上面的输出作为输入, 然后按照$to字段进行分组, 然后取出一些数据并做简单的计数<br>

看下面简单的图示: <br>

![4](/public/img/grocery/mongo/mongo-3.jpg  "aggregate")<br>


当然这个过程还可以无限继续, 这个就是管道的便捷之处.


###2.管道操作

管道的使用是很简单的, 我比较关心的是它可以提供哪些强大的操作来帮助我们. <br>
一些常用的操作如下: <br>

- $project：用于修改输入文档的结构. 可以用来重命名、增加或删除文档字段，也可以用于创建计算结果以及嵌套文档.
- $match：用于过滤数据，只输出符合条件的文档.
- $limit：用来限制MongoDB聚合管道返回的文档数.
- $skip：在聚合管道中跳过指定数量的文档，并返回余下的文档.
- $sort：将输入文档排序后输出。
- $unwind：将文档中的某一个数组类型字段拆分成多条，每条包含数组中的一个值.
- $geoNear：输出接近某一地理位置的有序文档.
- $group：将集合中的文档进行分组，可用于统计结果.

<font>***下面详细解释其中的一些操作使用方法:***</font>

<br>
> $project <br>

投影操作, 意思就是对于原有的文档数据进行投影操作, 可以映射为不同的形式. 这里包括: 选出其中的一些字段, 可以对其中一些字段进行
重命名, 可以对字段进行简单的计算. 举个例子, 原文档格式如下:

```
{
   _id:  int64,
   msg:  string,
   type: int,
   time: int64,
   from: int64,
   to:   int64,
   count:int,
}
```

1).如果我们做这样一个操作:

```
db.msg.aggregate(
{
  [
    $project:
    {
        from: 1,
        to  : 1,
    }
  ]
}
);

注意, 如果你需要在终端中进行尝试这段命令, 那么格式应该是上面那样, 多一个 '[]'

```

那么我们得到的结果仅仅就包含需要的两个数据和_id. 这个是筛选以及删除功能, 按需取得需要的数据. 需要注意的是_id是默认包含的, 如果不需要
加上_id:0就OK. <br>

2).我们可以进行简单的计算, 顺便我们把它重命名一下:

```
db.msg.aggregate(
{
  [
    $project:
    {
        count2: {$add: ["$count", 3]},
        type2: "$type"
    }
  ]
}
```
上面的操作, 返回两个元素加上_id, count+3==>新的元素count2, 这里使用了计算和重命名操作, 下面的type就是纯粹的重命名操作.

3). 还可以添加元素:

```
db.msg.aggregate(
{
  [
    $project:
    {
        adddd : {
            add1: "$type",
            add2: {$add:["count",3]},
        }
    }
  ]
}
```

例如这里增加了一个子结构adddd, 里面包含一些字段add1和add2, 这些字段是由原始的字段经过一些计算得到的.

<br>
> $match <br>

match是组常见的操作了, 这个和平时使用的没什么不一样, 不想多说什么了,举个例子好了:

```
db.msg.aggregate(
{
  [
    $match:
    {
        {from:1, to:2}
    }
  ]
}

```
上面筛选出1发送给2的消息文档.

<br>
> $limit <br>

这个更简单, 限制文档的最大返回数量.

```
db.msg.aggregate([{$limit: 10}])
```

上面的语句返回前前10个文档.

<br>
> $skip <br>

这个和上面一样简单, 跳过搜索出来的前N个文档, 返回后面的文档.

```
db.msg.aggregate([{$skip: 10}])
```
上面语句跳过前10个文档, 返回后面的文档.

```
db.msg.aggregate([{ $skip : 5}, {$limit: 5 }])
```
综合使用.

<br>
> $sort <br>

这个也很简单, 根据相应的字段进行排序.

```
db.msg.aggregate([{ $sort:{time: -1, count: 1}}]);
```

上面语句将msg按照time降序排序, 同时按照count增序排序.

<br>
> $unwind: 将数组元素拆分为独立字段

这个我之前用的比较少, 感觉实用性不大的. (⊙o⊙)…, 或许我遇到这样的场景比较少. <br>
这个意思是对数组进行拆分, 例如如果其中有一个字段是userIDs:

```
{
    _id:     1
    userIDs: [1,2,3]
}
```

那么我们进行这样的操作:

```
db.msg.aggregate([{$unwind: "$userIDs"}]);
```
结果会变成三个:

```
{
    _id:     1
    userIDs: 1
}

{
    _id:     1
    userIDs: 2
}

{
    _id:     1
    userIDs: 3
}
```

注意: <br>
> 如果$unwind目标字段不存在的话, 那么该文档将被忽略. <br>
> 如果$unwind目标字段不是一个数组的话, 将会产生错误. <br>
> 如果$unwind目标字段数组为空, 该文档将会被忽略. <br>

<br>
> $geoNear <br>

说真的, 这个是唯一一个没有使用过的操作, Orz... 额, 不知道咋写了. 看了一下其基本意思是返回一些坐标值，这些值以按照距离指定点距离由近到远进行排序.
如果想知道这是什么, 请: <a href="http://www.google.com"  target="_blank">走这里</a><br>

<br>
> $group <br>

最后想好好说说group这个操作, 这个真的是很有用的! 这个类似于SQL中的group by, 例如: ```select * from xxx group by user```,
按照user进行分组, 并做一些处理. <br>
在使用$group的时候, 我们必须要指定一个_id域，然后可以包含一些算术类型的表达式操作符.

```
// 还是使用上面的msg表
{
    $group:
    {
        _id: "$id",
        msgCount: {$sum:1}
    }
}
```
上面的操作是按照"$id"字段进行分组, 然后做了一个计算, $sum是计算每个分组的数量. 这里的意思是计算每个id的文档数量.<br>

如果是下面这样:

```
{
    $group:
    {
        _id: "$id",
        msgCount: {$sum:"$count"}
    }
}
就是按照某一个字段进行sum.

```

常见的group的操作有下面几种:

```
$sum: 计算总和
例如: db.xxx.aggregate([{$group:{_id : "$id", count: {$sum: "$click"}}}])
上面是求click和计算.

$avg: 计算平均值xxx
例如: db.xxx.aggregate([{$group:{_id : "$id", count: {$avg: "$click"}}}])
上面是求click平均值计算.

$min: 获取每个分组的文档中,指定值最小的文档,如果有多个,只会返回一个结果
例如: db.xxx.aggregate([{$group:{_id : "$id", count: {$min: "$click"}}}])

$max: 获取每个分组的文档中,指定值最大的文档,如果有多个,只会返回一个结果
例如: db.xxx.aggregate([{$group:{_id : "$id", count: {$max: "$click"}}}])

$push: 将文档中插入到一个数组中。这个很有用, 如果每个分组返回的结果是存在多个, 而且使用一个数组来进行接收元素, 那么这个太有用了!
例如: db.xxx.aggregate([{$group:{_id : "$id", count: {$push: "$click"}}}])
这个结果会返回到一个接收click的数组中.

$addToSet: 在结果文档中插入值到一个数组中，但不创建副本。
例如: db.xxx.aggregate([{$group:{_id : "$id", count: {$addToSet: "$click"}}}])

$first: 返回结果中的第一个文档
例如: db.xxx.aggregate([{$group:{_id : "$id", first_click: {$first: "$click"}}}])

$last: 返回结果中的最后一个文档
例如: db.xxx.aggregate([{$group:{_id : "$id", last_click: {$last: "$click"}}}])
```
下面这个链接是一个官方的解释: <a href="https://docs.mongodb.com/manual/reference/operator/aggregation-group/"  target="_blank">Group Accumulator Operators</a><br>

管道的基本知识点大概就是这么多, 还有一些技巧, 只能在实践中去慢慢掌握了~~~


###3.参考:<br>
<a href="https://docs.mongodb.com/manual/reference/method/db.collection.aggregate/"  target="_blank">Mongodb aggregate</a><br>
<a href="http://www.runoob.com/mongodb/mongodb-aggregate.html"  target="_blank">MongoDB 聚合</a><br>



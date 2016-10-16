---
layout: post
title: 实时日志流系统(kafka-flume-hdfs)
category: 技术
tags: 其他技术
keywords:
description:
---

之前有学习过ELK日志分析系统(<a href="http://shanshanpt.github.io/2016/10/02/elk.html"  target="_blank">ELK</a>),
今天写的这篇是关于实时处理log简介, 一般来说, 不管是后台直接记录log, 或者客户端上传log, 都不会直接将log写入存储, 那样做真的是
浪费server时间, 所以一般会使用"消息队列"来缓冲, 然后在后台慢慢的写入这些log, 这样的操作才是高效的正确姿势.<br>
在本文, 我们使用的消息队列是kafka, 当然也可以使用其他的消息队列例如: RabbitMQ, ZeroMQ等等, 具体的它们之间的比较可以去网上搜索或者自己试验...
简单来说就是下面这样的流程: <br>

![1](/public/img/grocery/other/kafka_flume_hdfs_1.png  "1")<br>

下面介绍一些这些组件的安装以及配置(<font color=#0099ff>注意: 本文是在mac OS X 系统下安装配置的</font>):

###1. zookeeper,kafka安装以及配置
1). kafka是依赖于zookeeper进行负载均衡等控制的, 所以首先需要安装zookeeper, 在mac上直接使用 ```brew install zookeeper```就能安装好, 当然使用
源码安装也是OK的(本文安装的版本号: 3.4.7). 看一下zookeeper的配置文件, 在 xxx/zookeeper/libexec/etc/zookeeper/zoo.cfg,
(如果使用的brew安装, 那么路径一般是/usr/local/Cellar/zookeeper/x.x.x/....)

```
# 这些配置几乎是直接可以使用的
#
# The number of milliseconds of each tick
tickTime=2000
# The number of ticks that the initial
# synchronization phase can take
initLimit=10
# The number of ticks that can pass between
# sending a request and getting an acknowledgement
syncLimit=5
# the directory where the snapshot is stored.
# do not use /tmp for storage, /tmp here is just
# example sakes.
#
# 如果使用的是brew安装的, 那么此处的缓冲路径已经是自动写好的
# 如果是源码安装, 那么可能你需要自己手动去创建一个缓冲数据的路径
#
dataDir=/usr/local/var/run/zookeeper/data
# the port at which the clients will connect
clientPort=2181
# the maximum number of client connections.
# increase this if you need to handle more clients
#maxClientCnxns=60
#
# Be sure to read the maintenance section of the
# administrator guide before turning on autopurge.
#
# http://zookeeper.apache.org/doc/current/zookeeperAdmin.html#sc_maintenance
#
# The number of snapshots to retain in dataDir
#autopurge.snapRetainCount=3
# Purge task interval in hours
# Set to "0" to disable auto purge feature
#autopurge.purgeInterval=1
```

启动zookeeper: zookeeper的server的可执行文件在bin下, 所以执行```./bin/zkServer start``` 如果权限不够出现Permission denied,
使用```sudo ./bin/zkServer start```就OK. 这样执行会默认调用上面路径的的配置文件, 如果自己重新定义了一个路径下的配置文件, 可以指定,
具体操作, 上网搜一下... <br>

2). 安装kafka也是很简单的, 直接使用 ```brew install kafka```就能安装(本文安装的版本号: 0.8.2.2). OK, 之前我们已经启动了zookeeper的server,
现在我们进到/usr/local/Cellar/kafka/0.8.2.2/下, 所有的启动脚本在 ./bin目录下, 所有的配置文件在./libexec/config/下, 现在启动kafka server使用
```sudo ./bin/kafka-server-start.sh ./libexec/config/server.properties```, 如果没有什么错误, kafka server应该就启动成功了! <br>

下面尝试把kafka的生产者启动起来, 在这之前, 我们首先创建一个topic, ```./bin/kafka-topics.sh --create --topic testtopic --replication-factor 1 --partitions 1 --zookeeper localhost:2181```,
创建的topic名称是testtopic, 注意最后的参数是connect到当前启动的zookeeper上, 默认的端口是2181. <br>

启动kafka生产者: ```./bin/kafka-console-producer.sh --broker-list localhost:9092 --sync --topic testtopic ```<br>
启动kafka消费者: ```./bin/kafka-console-consumer.sh --zookeeper localhost:2181 --topic testtopic --from-beginning ```<br>

理论上来说: 此时在生产者的终端输入数据, 会在消费者的终端看到...<br>

![2](/public/img/grocery/other/kafka_flume_hdfs_2.png  "2")<br>

上图, 左边是生产者, 右边是消费者,看起来是没有什么问题的...


###2. 安装配置flume
安装也不多说了, 直接使用```brew install flume``` (我的版本是: 1.6.0), 配置文件在 /usr/local/Cellar/flume/1.6.0/libexec/conf,
flume可以接收很多不同的输入源, 也可以输出到不同地方, 首先如果配置文件下没有flume-env.sh, 那么需要 ```cp flume-env.sh.template flume-env.sh```,
这里面唯一需要配置的可能就是JAVE\_HOME了, 但是一般来说, JAVA\_HOME我们一般在 ~/.bash\_profile中export(如果你没有这个文件, 需要自己创建一个), ```export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk1.8.0_74.jdk/Contents/Home/```,
这是我的路径, 每个人的可能是不一样的. <br>
然后比较重要的是需要```cp flume-conf.properties.template flume-conf.properties```, 这个是创建一个flume启动的配置文件, 现在我们创建一个avro为输入源的配置文件,
输出是hdfs(可能现在还没有安装配置hdfs, 不用急, 先看看配置文件, 后面再实际运行):

```
# ------------------- 定义数据流----------------------
# source的名字(名称自定义)
agent.sources = avroSource
# channels的名字，建议按照type来命名
agent.channels = memoryChannel
# sink的名字，建议按照目标来命名
agent.sinks = hdfsSink

# 指定source使用的channel名字(名称自定义)
agent.sources.avroSource.channels = memoryChannel
# 指定sink需要使用的channel的名字
agent.sinks.hdfsSink.channel = memoryChannel

#-------- avroSource相关配置-----------------
# 定义消息源类型(重要!需要指定输入源的host+port, 如果想要指定输入源是kafka, 那么需要指定zookeeper的port:2181)
agent.sources.avroSource.type = avro
# 定义消息源所在地址和端口
agent.sources.avroSource.bind=127.0.0.1
agent.sources.avroSource.port=10000

#------- memoryChannel相关配置-------------------------
# channel类型
agent.channels.memoryChannel.type = memory
# channel存储的事件容量
agent.channels.memoryChannel.capacity=1000
# 事务容量
agent.channels.memoryChannel.transactionCapacity=100

#---------hdfsSink 相关配置------------------
# 下面指定的是输出源, 输出到hdfs, 目前还没有安装配置, 所以待会再回来说...
agent.sinks.hdfsSink.type = hdfs
# 注意提前在hdfs上提前创建相应的目录
agent.sinks.hdfsSink.hdfs.path = hdfs://127.0.0.1:9000/user/hive/warehouse
```

###3.Hadoop安装配置
Hadoop我是手动安装的, 我是在清华的mirror下载的: <a href="https://mirrors.tuna.tsinghua.edu.cn/apache/hadoop/common/"  target="_blank">下载hadoop-2.7.2</a> <br>
1). 首先配置Mac OS自身ssh环境 <br>
下面配置ssh免密码登录, 在~目录下: ```ssh-keygen -t dsa -P '' -f ~/.ssh/id_dsa```, 用dsa密钥认证来生成一对公钥和私钥. 然后将生成的公钥加入到用于认证的公钥文件中,
```cat ~/.ssh/id_dsa.pub >> ~/.ssh/authorized_keys```, 下面执行```ssh localhost```看看是否配置成功.  (可能出现的错误: 如果遇到connection refused之类的错误，检查一下mac是否开启远程登录功能，在系统偏好设置中可以设置。) <br>

2). 将hadoop解压到你喜欢的目录, 准备进行安装, 我的在~/hadoop-2.7.2目录. 注意手动安装的需要手动知道HADOOP\_HOME路径, 之前已经说过, 可以写在~/.bash_profile文件中,

```
# 我在此处配置的环境变量比较多
#
export JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk1.8.0_74.jdk/Contents/Home/
export HADOOP_HOME=/Users/xxx/hadoop-2.7.2
export HADOOP_PREFIX=$HADOOP_HOME
export PATH=$PATH:$HADOOP_HOME/bin
export PATH=$PATH:$HADOOP_HOME/sbin
export HADOOP_MAPRED_HOME=$HADOOP_HOME
export HADOOP_COMMON_HOME=$HADOOP_HOME
export HADOOP_HDFS_HOME=$HADOOP_HOME
export YARN_HOME=$HADOOP_HOME
export HADOOP_COMMON_LIB_NATIVE_DIR=$HADOOP_HOME/lib/native
```

3). 配置Hadoop<br>
注意, 配置文件在目录: /Users/xxx/hadoop-2.7.2/etc/hadoop, <br>
> 1.首先看hadoop-env.sh文件, 里面主要需要配置```export JAVA_HOME=${JAVA_HOME}```, 如果已经配置了那么是极好的, 没有配置会报错找不到JDK.<br>

> 2.然后需要配置core-site.xml:

```
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="configuration.xsl"?>
<!--
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License. See accompanying LICENSE file.
-->

<!-- Put site-specific property overrides in this file. -->

<configuration>
    <property>
        <name>fs.defaultFS</name>
        <value>hdfs://localhost:9000</value>
    </property>
    <property>
        <name>hadoop.tmp.dir</name>
        <value>file:/Users/xxx/hadoop-2.7.2/tmp</value>
    </property>
    <property>
        <name>io.file.buffer.size</name>
        <value>131702</value>
    </property>
    <property>
        <name>dfs.permissions</name>
        <value>false</value>
    </property>
</configuration>
```
上面的配置文件用于指定NameNode的主机名与端口, 需要注意最后一个属性dfs.permissions, 这个value最好置为false, 不然后面可能会出现一些奇怪的权限问题... <br>

> 3.配置hdfs-site.xml:

```
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="configuration.xsl"?>
<!--
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License. See accompanying LICENSE file.
-->

<!-- Put site-specific property overrides in this file. -->

<configuration>
    <property>
        <name>dfs.namenode.name.dir</name>
        <value>file:/Users/xxx/hadoop-2.7.2/tmp/hdfs/name</value>
    </property>
    <property>
        <name>dfs.datanode.data.dir</name>
        <value>file:/Users/xxx/hadoop-2.7.2/tmp/hdfs/data</value>
    </property>

    <property>
        <name>dfs.replication</name>
        <value>1</value>
    </property>

    <property>
        <name>dfs.namenode.secondary.http-address</name>
        <value>localhost:9001</value>
    </property>
    <property>
      <name>dfs.webhdfs.enabled</name>
      <value>true</value>
    </property>
</configuration>
```
上面文件指定了HDFS的默认参数及副本数,因为仅运行在一个节点上,所以这里的副本数为1. 当然, 上面的namenode和datanode的时间保存路径可以随便设置,
但是最好放在hadoop目录下面.

4). 初始化hadoop<br>
在hadoop主目录下输入一下命令: ```bin/hdfs namenode -format```

```
...
Re-format filesystem in Storage Directory /Users/xxx/hadoop-2.7.2/tmp/hdfs/name ? (Y or N) y
16/10/16 17:48:34 INFO namenode.FSImage: Allocated new BlockPoolId: BP-1541377584-192.168.0.102-1476611314628
16/10/16 17:48:34 INFO common.Storage: Storage directory /Users/xxx/hadoop-2.7.2/tmp/hdfs/name has been successfully formatted.
16/10/16 17:48:34 INFO namenode.NNStorageRetentionManager: Going to retain 1 images with txid >= 0
16/10/16 17:48:34 INFO util.ExitUtil: Exiting with status 0
16/10/16 17:48:34 INFO namenode.NameNode: SHUTDOWN_MSG:
/************************************************************
SHUTDOWN_MSG: Shutting down NameNode at xxx-mn1/192.168.0.102
************************************************************/

```
上面如是输出的结果是: "...has been successfully formatted.", 那么说明执行成功, 即表示已经初始化完成.

5). 启动hadoop<br>
所有的启动脚本都在./sbin目录下, 现在尝试启动hdfs, 那么执行 ```./sbin/start-dfs.sh```出现:

```
[~/hadoop-2.7.2] $ ./sbin/start-dfs.sh
Starting namenodes on [localhost]
localhost: starting namenode, logging to /Users/xxx/hadoop-2.7.2/logs/hadoop-xxx-namenode-xxx-mn1.out
Starting datanodes on [localhost]
localhost: starting datanode, logging to /Users/xxx/hadoop-2.7.2/logs/hadoop-xxx-datanode-xxx-mn1.out
Starting secondary namenodes [localhost]
localhost: starting secondarynamenode, logging to /Users/xxx/hadoop-2.7.2/logs/hadoop-xxx-secondarynamenode-xxx-mn1.out
```
那么到底有木有启动成功呢?两种测试方法:

```
1. jps命令, 看看有木有: DataNode   SecondaryNameNode   NameNode
2. 是否能打开: http://localhost:50070/
```

![3](/public/img/grocery/other/kafka_flume_hdfs_3.png  "3")<br>

6). 环境已经搭建完成,接下来运行一下WordCount例子.

```
1.新建一个测试文件,内容随意
2.在HDFS中新建测试文件夹test.命令为: bin/hdfs dfs -mkdir /test, 使用”bin/hdfs dfs -ls /”命令查看是否新建成功.
3.上传测试文件,命令如下:bin/hdfs dfs -put ~/Desktop/1.go /test/, 可使用之前命令查看是否上传成功.
4.运行wordcount,命令如下:bin/hadoop jar share/hadoop/mapreduce/hadoop-mapreduce-examples-2.7.2.jar wordcount /test/1.go /test/out,运行完成后,在/test目录下生成名为out的目录
```
如果上面的都执行成功了, 那么在http://localhost:50070/页面中能看到数据: <br>

![4](/public/img/grocery/other/kafka_flume_hdfs_4.png  "4")<br>

![5](/public/img/grocery/other/kafka_flume_hdfs_5.png  "5")<br>

(<font color=#0099ff>注意: 可能会出现的错误</font>)

```
16/10/16 18:18:25 WARN hdfs.DFSClient: DataStreamer Exception
org.apache.hadoop.ipc.RemoteException(java.io.IOException): File /test/1.go._COPYING_ could only be replicated to 0 nodes instead of minReplication (=1).  There are 0 datanode(s) running and no node(s) are excluded in this operation.
	at org.apache.hadoop.hdfs.server.blockmanagement.BlockManager.chooseTarget4NewBlock(BlockManager.java:1547)
	at org.apache.hadoop.hdfs.server.namenode.FSNamesystem.getNewBlockTargets(FSNamesystem.java:3107)
	at org.apache.hadoop.hdfs.server.namenode.FSNamesystem.getAdditionalBlock(FSNamesystem.java:3031)
	at org.apache.hadoop.hdfs.server.namenode.NameNodeRpcServer.addBlock(NameNodeRpcServer.java:724)
	at org.apache.hadoop.hdfs.protocolPB.ClientNamenodeProtocolServerSideTranslatorPB.addBlock(ClientNamenodeProtocolServerSideTranslatorPB.java:492)
	at org.apache.hadoop.hdfs.protocol.proto.ClientNamenodeProtocolProtos$ClientNamenodeProtocol$2.callBlockingMethod(ClientNamenodeProtocolProtos.java)
	at org.apache.hadoop.ipc.ProtobufRpcEngine$Server$ProtoBufRpcInvoker.call(ProtobufRpcEngine.java:616)
	at org.apache.hadoop.ipc.RPC$Server.call(RPC.java:969)
	at org.apache.hadoop.ipc.Server$Handler$1.run(Server.java:2049)
	at org.apache.hadoop.ipc.Server$Handler$1.run(Server.java:2045)
	at java.security.AccessController.doPrivileged(Native Method)
	at javax.security.auth.Subject.doAs(Subject.java:422)
	at org.apache.hadoop.security.UserGroupInformation.doAs(UserGroupInformation.java:1657)
	at org.apache.hadoop.ipc.Server$Handler.run(Server.java:2043)

	at org.apache.hadoop.ipc.Client.call(Client.java:1475)
	at org.apache.hadoop.ipc.Client.call(Client.java:1412)
	at org.apache.hadoop.ipc.ProtobufRpcEngine$Invoker.invoke(ProtobufRpcEngine.java:229)
	at com.sun.proxy.$Proxy9.addBlock(Unknown Source)
	at org.apache.hadoop.hdfs.protocolPB.ClientNamenodeProtocolTranslatorPB.addBlock(ClientNamenodeProtocolTranslatorPB.java:418)
	at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
	at sun.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)
	at sun.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
	at java.lang.reflect.Method.invoke(Method.java:498)
	at org.apache.hadoop.io.retry.RetryInvocationHandler.invokeMethod(RetryInvocationHandler.java:191)
	at org.apache.hadoop.io.retry.RetryInvocationHandler.invoke(RetryInvocationHandler.java:102)
	at com.sun.proxy.$Proxy10.addBlock(Unknown Source)
	at org.apache.hadoop.hdfs.DFSOutputStream$DataStreamer.locateFollowingBlock(DFSOutputStream.java:1459)
	at org.apache.hadoop.hdfs.DFSOutputStream$DataStreamer.nextBlockOutputStream(DFSOutputStream.java:1255)
	at org.apache.hadoop.hdfs.DFSOutputStream$DataStreamer.run(DFSOutputStream.java:449)
put: File /test/1.go._COPYING_ could only be replicated to 0 nodes instead of minReplication (=1).  There are 0 datanode(s) running and no node(s) are excluded in this operation.
```

上面的报错是由于datanode报错, JPS命令看一下datanode是否启动, 如果没有启动, 那么将存放data的路径(路径配置在: ./etc/hadoop/hdfs-site.xml中的dfs.datanode.data.dir字段)下所有文件删除,
可能是保留了之前不兼容的数据, 然后重启Hadoop. 如果还是不行启动之前格式化一下Hadoop, ```bin/hadoop dfs -format```.

OK, 至此Hadoop的简单配置完成!

###4. flume数据输出到hadoop
最后一个需要解决的问题是flume的数据怎么输出到HDFS呢? 回头看一下之前的flume的配置文件,

```
......
#---------hdfsSink 相关配置------------------
# 下面指定的是输出源, 输出到hdfs, 目前还没有安装配置, 所以待会再回来说...
agent.sinks.hdfsSink.type = hdfs
# 注意提前在hdfs上提前创建相应的目录
agent.sinks.hdfsSink.hdfs.path = hdfs://127.0.0.1:9000/user/hive/warehouse
```
这里有一个配置路径是"hdfs://127.0.0.1:9000/user/hive/warehouse", 表明flume的数据上传到HDFS中的保存路径, 所以首先,
我们需要手动创建一个这样的路径, ```bin/hdfs dfs -mkdir /user/hive/warehouse```, 然后在http://localhost:50070/看一下有没有成功, 或者使用```bin/hdfs dfs -ls /```, <br>
<font color=#0099ff>注意</font>, 如果上面不能直接一步创建, 那么尝试:

```
[~/hadoop-2.7.2] $ bin/hdfs dfs -mkdir /user
[~/hadoop-2.7.2] $ bin/hdfs dfs -mkdir /user/hive
[~/hadoop-2.7.2] $ bin/hdfs dfs -mkdir /user/hive/warehouse
```
OK, 现在, 我们需要启动flume server:

```
bin/flume-ng agent --conf ./libexec/conf --conf-file ./libexec/conf/flume-conf.properties --name agent -Dflume.root.logger=INFO,console
# 参数 --conf ./libexec/conf代表配置文件路径
# 参数 --conf-file ./libexec/conf/flume-conf.properties代表配置文件
```

然后开启一个新的终端, 在flume目录下执行:

```
# 启动一个avro-client
sudo bin/flume-ng avro-client --conf ./libexec/conf/flume-conf.properties -H 127.0.0.1 -p 10000 -F ~/Desktop/KFH.txt
# 参数 --conf ./libexec/conf/flume-conf.properties代表配置文件
# 参数 -H 127.0.0.1代表flume的server host
# 参数 -p 10000代表flume server的port
# 参数 -F ~/Desktop/KFH.txt需要上传的文件路径(写一个你电脑存在的文件)
```
如果成功, 那么flume server端输出的log大概是:

```
2016-10-16 18:49:46,482 (New I/O server boss #1 ([id: 0xe46a3a9e, /127.0.0.1:10000])) [INFO - org.apache.avro.ipc.NettyServer$NettyServerAvroHandler.handleUpstream(NettyServer.java:171)] [id: 0x6bac3a7b, /127.0.0.1:52210 => /127.0.0.1:10000] OPEN
2016-10-16 18:49:46,482 (New I/O  worker #2) [INFO - org.apache.avro.ipc.NettyServer$NettyServerAvroHandler.handleUpstream(NettyServer.java:171)] [id: 0x6bac3a7b, /127.0.0.1:52210 => /127.0.0.1:10000] BOUND: /127.0.0.1:10000
2016-10-16 18:49:46,482 (New I/O  worker #2) [INFO - org.apache.avro.ipc.NettyServer$NettyServerAvroHandler.handleUpstream(NettyServer.java:171)] [id: 0x6bac3a7b, /127.0.0.1:52210 => /127.0.0.1:10000] CONNECTED: /127.0.0.1:52210
2016-10-16 18:49:46,705 (New I/O  worker #2) [INFO - org.apache.avro.ipc.NettyServer$NettyServerAvroHandler.handleUpstream(NettyServer.java:171)] [id: 0x6bac3a7b, /127.0.0.1:52210 :> /127.0.0.1:10000] DISCONNECTED
2016-10-16 18:49:46,705 (New I/O  worker #2) [INFO - org.apache.avro.ipc.NettyServer$NettyServerAvroHandler.handleUpstream(NettyServer.java:171)] [id: 0x6bac3a7b, /127.0.0.1:52210 :> /127.0.0.1:10000] UNBOUND
2016-10-16 18:49:46,706 (New I/O  worker #2) [INFO - org.apache.avro.ipc.NettyServer$NettyServerAvroHandler.handleUpstream(NettyServer.java:171)] [id: 0x6bac3a7b, /127.0.0.1:52210 :> /127.0.0.1:10000] CLOSED
2016-10-16 18:49:46,706 (New I/O  worker #2) [INFO - org.apache.avro.ipc.NettyServer$NettyServerAvroHandler.channelClosed(NettyServer.java:209)] Connection to /127.0.0.1:52210 disconnected.
2016-10-16 18:49:50,534 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.close(BucketWriter.java:363)] Closing hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963855.tmp
2016-10-16 18:49:50,542 (hdfs-hdfsSink-call-runner-0) [INFO - org.apache.flume.sink.hdfs.BucketWriter$8.call(BucketWriter.java:629)] Renaming hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963855.tmp to hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963855
2016-10-16 18:49:50,557 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.open(BucketWriter.java:234)] Creating hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963856.tmp
2016-10-16 18:49:50,583 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.close(BucketWriter.java:363)] Closing hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963856.tmp
2016-10-16 18:49:50,587 (hdfs-hdfsSink-call-runner-4) [INFO - org.apache.flume.sink.hdfs.BucketWriter$8.call(BucketWriter.java:629)] Renaming hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963856.tmp to hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963856
2016-10-16 18:49:50,603 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.open(BucketWriter.java:234)] Creating hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963857.tmp
2016-10-16 18:49:50,625 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.close(BucketWriter.java:363)] Closing hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963857.tmp
2016-10-16 18:49:50,632 (hdfs-hdfsSink-call-runner-8) [INFO - org.apache.flume.sink.hdfs.BucketWriter$8.call(BucketWriter.java:629)] Renaming hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963857.tmp to hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963857
2016-10-16 18:49:50,647 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.open(BucketWriter.java:234)] Creating hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963858.tmp
2016-10-16 18:49:50,671 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.close(BucketWriter.java:363)] Closing hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963858.tmp
2016-10-16 18:49:50,674 (hdfs-hdfsSink-call-runner-2) [INFO - org.apache.flume.sink.hdfs.BucketWriter$8.call(BucketWriter.java:629)] Renaming hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963858.tmp to hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963858
2016-10-16 18:49:50,690 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.open(BucketWriter.java:234)] Creating hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963859.tmp
2016-10-16 18:49:50,715 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.close(BucketWriter.java:363)] Closing hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963859.tmp
2016-10-16 18:49:50,719 (hdfs-hdfsSink-call-runner-6) [INFO - org.apache.flume.sink.hdfs.BucketWriter$8.call(BucketWriter.java:629)] Renaming hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963859.tmp to hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963859
2016-10-16 18:49:50,737 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.open(BucketWriter.java:234)] Creating hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963860.tmp
2016-10-16 18:49:50,763 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.close(BucketWriter.java:363)] Closing hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963860.tmp
2016-10-16 18:49:50,768 (hdfs-hdfsSink-call-runner-0) [INFO - org.apache.flume.sink.hdfs.BucketWriter$8.call(BucketWriter.java:629)] Renaming hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963860.tmp to hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963860
2016-10-16 18:49:50,785 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.open(BucketWriter.java:234)] Creating hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963861.tmp
2016-10-16 18:49:50,811 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.close(BucketWriter.java:363)] Closing hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963861.tmp
2016-10-16 18:49:50,816 (hdfs-hdfsSink-call-runner-4) [INFO - org.apache.flume.sink.hdfs.BucketWriter$8.call(BucketWriter.java:629)] Renaming hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963861.tmp to hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963861
2016-10-16 18:49:50,837 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.open(BucketWriter.java:234)] Creating hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963862.tmp
2016-10-16 18:49:50,862 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.close(BucketWriter.java:363)] Closing hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963862.tmp
2016-10-16 18:49:50,866 (hdfs-hdfsSink-call-runner-8) [INFO - org.apache.flume.sink.hdfs.BucketWriter$8.call(BucketWriter.java:629)] Renaming hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963862.tmp to hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963862
2016-10-16 18:49:50,884 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.open(BucketWriter.java:234)] Creating hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963863.tmp
2016-10-16 18:49:50,909 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.close(BucketWriter.java:363)] Closing hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963863.tmp
2016-10-16 18:49:50,912 (hdfs-hdfsSink-call-runner-2) [INFO - org.apache.flume.sink.hdfs.BucketWriter$8.call(BucketWriter.java:629)] Renaming hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963863.tmp to hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963863
2016-10-16 18:49:50,931 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.open(BucketWriter.java:234)] Creating hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963864.tmp
2016-10-16 18:49:50,957 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.close(BucketWriter.java:363)] Closing hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963864.tmp
2016-10-16 18:49:50,961 (hdfs-hdfsSink-call-runner-6) [INFO - org.apache.flume.sink.hdfs.BucketWriter$8.call(BucketWriter.java:629)] Renaming hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963864.tmp to hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963864
2016-10-16 18:49:51,012 (SinkRunner-PollingRunner-DefaultSinkProcessor) [INFO - org.apache.flume.sink.hdfs.BucketWriter.open(BucketWriter.java:234)] Creating hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963865.tmp
2016-10-16 18:50:21,041 (hdfs-hdfsSink-call-runner-8) [INFO - org.apache.flume.sink.hdfs.BucketWriter$8.call(BucketWriter.java:629)] Renaming hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963865.tmp to hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963865
2016-10-16 18:50:21,042 (hdfs-hdfsSink-roll-timer-0) [INFO - org.apache.flume.sink.hdfs.HDFSEventSink$1.run(HDFSEventSink.java:394)] Writer callback called.
```
上面出现很多生成的文件, 例如hdfs://127.0.0.1:9000/user/hive/warehouse/FlumeData.1476614963865, 现在到http://localhost:50070/看一下: <br>

![6](/public/img/grocery/other/kafka_flume_hdfs_6.png  "6")<br>

路径下确实有生成的文件!!!完美! <br>


OK, 看起来我们的任务完成了80%了, 对, 还有最后一步就怎么将kafka的数据塞到HDFS呢? 这显然是需要修改flume的配置文件的, 因为之前说过, flume可以接收不同的输入, OK,
现在创建一个"flume-conf-kafka-input.properties "文件如下:

```
# ------------------- 定义数据流----------------------
# source的名字
agent.sources = kafkaSource
# channels的名字，建议按照type来命名
agent.channels = memoryChannel
# sink的名字，建议按照目标来命名
agent.sinks = hdfsSink

# 指定source使用的channel名字
agent.sources.kafkaSource.channels = memoryChannel
# 指定sink需要使用的channel的名字,注意这里是channel
agent.sinks.hdfsSink.channel = memoryChannel

#-------- kafkaSource相关配置-----------------
# 定义消息源类型
agent.sources.kafkaSource.type = org.apache.flume.source.kafka.KafkaSource
# 定义kafka所在zk的地址
#
# 这里特别注意: 是kafka的zookeeper的地址
#
agent.sources.kafkaSource.zookeeperConnect = 127.0.0.1:2181
# 配置消费的kafka topic
agent.sources.kafkaSource.topic = testtopic
# 配置消费者组的id
agent.sources.kafkaSource.groupId = flume
# 消费超时时间,参照如下写法可以配置其他所有kafka的consumer选项。注意格式从kafka.xxx开始是consumer的配置属性
agent.sources.kafkaSource.kafka.consumer.timeout.ms = 100



#------- memoryChannel相关配置-------------------------
# channel类型
agent.channels.memoryChannel.type = memory
# channel存储的事件容量
agent.channels.memoryChannel.capacity=1000
# 事务容量
agent.channels.memoryChannel.transactionCapacity=100

#---------hdfsSink 相关配置------------------
agent.sinks.hdfsSink.type = hdfs
# 注意, 我们输出到下面一个子文件夹datax中
agent.sinks.hdfsSink.hdfs.path = hdfs://127.0.0.1:9000/user/hive/warehouse/datax
agent.sinks.hdfsSink.hdfs.writeFormat = Text
agent.sinks.hdfsSink.hdfs.fileType = DataStream
```

OK, 现在起到一个kafka的生产者, 怎么起之前已将说了, 并且生产的topic是"testtopic", 然后我们看看HDFS中是不是有数据呢? 好激动...

```
# 在kafka中执行:
./bin/kafka-console-producer.sh --broker-list localhost:9092 --sync --topic testtopic
# 生产这个testtopic主题数据
```

然后看下面的截图: <br>

第一张图: 生产者生产数据 <br>

![7](/public/img/grocery/other/kafka_flume_hdfs_7.png  "7")<br>

第二张图: flume server的输出 <br>

![8](/public/img/grocery/other/kafka_flume_hdfs_8.png  "8")<br>

第三张图: 网页中出现datax文件夹 <br>

![9](/public/img/grocery/other/kafka_flume_hdfs_9.png  "9")<br>

第四张图: datax中存入了数据 <br>

![10](/public/img/grocery/other/kafka_flume_hdfs_10.png  "10")<br>

哇塞, 好像真的OK, 哦...那就OK了吧...


###5.参考 <br>
<a href="http://www.cnblogs.com/micrari/p/5716851.html"  target="_blank">Hadoop安装以及配置</a> <br>
<a href="http://kiritor.github.io/2016/04/24/Hadoop-install/"  target="_blank">Mac下Hadoop2.7.x配置伪分布环境(wordcount运行)</a> <br>
<a href="http://kaimingwan.com/post/flume/flumecong-kafkala-xiao-xi-chi-jiu-hua-dao-hdfs"  target="_blank">flume从kafka拉消息持久化到hdfs</a> <br>





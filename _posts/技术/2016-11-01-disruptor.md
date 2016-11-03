---
layout: post
title: 高效内存无锁队列 Disruptor
category: 技术
tags: 其他技术
keywords:
description:
---

前段时间看了下LMAX的Disruptor内存队列, 简单来说Disruptor就是一个生产者-消费者队列.<br>
原论文题目是: Disruptor：High performance alternative to bounded queues for exchanging data between concurrent threads.
搜了一下, 竟然有一篇博客翻译了这篇论文, 挺赞, 见: <a href="http://blog.sina.com.cn/s/blog_68ffc7a4010150yl.html"  target="_blank">点我</a>.<br>


###1. 简介
####1). 锁
一般来说生产消费队列使用锁来进行临界区管理, 防止资源竞争. 但是使用锁的代价比较高, 涉及到操作系统仲裁, 每次加锁解锁都需要进行内核切换，
它会挂起所有在等待这把锁的线程，直到锁持有者释放该锁。上下文切换会导致性能问题, 例如之前缓存在cache中的数据必须被清洗, 导致hit率降低等等.
在Disruptor中使用了CAS来代替了锁.<br>

<br>
####2). CAS
<a href="https://zh.wikipedia.org/zh-hk/%E6%AF%94%E8%BE%83%E5%B9%B6%E4%BA%A4%E6%8D%A2"  target="_blank">CAS</a>
在本质上来讲是一种原子操作, 锁机制的目的也是为了达到原子操作. CAS的好处在于不需要操作系统来进行上下文的切换, 这一部分代价是消除了.
但是CPU执行的代价是没办法免除的. 关于CAS的原理, 以及网上说的很多的关于CAS需要的memory barrier(多核CPU,并行处理时需要的技术)相关的内容,
本文不想多解释. 网上的资料太多了. 找了一篇还不错的memory barrier文章: <a href="http://preshing.com/20120710/memory-barriers-are-like-source-control-operations/"  target="_blank">memory barrier</a>

<br>
####3). 一般队列实现
可参考: <a href="http://mechanitis.blogspot.hk/2011/07/dissecting-disruptor-why-its-so-fast.html"  target="_blank">点我</a><br>
>  使用链表实现: 事实上, 这是常见的实现方式, 一般也是教科书上的实现方式. <br>
>  <font color=#0099ff>存在的问题: </font><br>
>  1). 链表中的节点不是连续内存, cache的hit率太低. 而且链表的节点一般是分配一个释放一个, GC太频繁, 太低效.(当然可以实现一个node pool这样节点池, 可以将节点重复利用也是能解决问题的.) <br>
>  2). 在多线程环境下, 会经常出现"false sharing"问题, 也称为"伪共享". 下面会继续说. <br>
>  3). 生产者和消费者的状态同步比较困难, 生产者线程和消费者线程数量或者执行速度可能会造成队列长期空或者满.
>
>  如果使用数组, 事实上还是没办法解决生产消费者问题, 同时难以扩展.<br>

Disruptor中使用的是Ring Buffer结构来实现队列的, 具体有什么好处后面再介绍.

<br>
####4). false sharing(伪共享)
可参考: <a href="http://mechanitis.blogspot.hk/2011/07/dissecting-disruptor-why-its-so-fast_22.html"  target="_blank">点我</a><br>
一般我们会认为从内存中读取数据就已经够快了, 是的, 相对从磁盘读取(例如数据库之类)确实是快非常多, 但是事实上CPU内部还有缓存: L3, L2, L1. 并且CPU中的缓存
是按照行来存储的, 所谓cpu cache line. 如下图所示:<br>

![1](/public/img/grocery/other/disruptor_1.jpg  "1")<br>

一般来说, cpu cache line一般是64B, 所以存储Int64类型的数据8个. 对于数组这样连续内存的结构, 使用cache的hit率是很高的. Ring Buffer从本质上来说
也是数组结构.<br>

那么"伪共享"是怎么出现的呢? 这个一般出现在多核的机器中. 如下图所示:<br>

![2](/public/img/grocery/other/disruptor_2.jpg  "2")<br>

首先我们的大前提是, CPU的L级缓存是整行一起cache的, 即cache line. 上图中, 两个线程同时操作, 碰巧两个cache同时缓存了这个数组,
此时CPU1改变了cache line中的1号数据并将数据更新到主存中, CPU2还是一直在读取读取读取..., 但是CPU1的改变写入内存后, 此时, 虽然CPU2没有主动修改数据,
但是内存数据的变更导致CPU2的cache line失效, 所以需要将这一行cache line重新进行更新, 这就导致, 如果此时CPU2此时如果想要读取
8号数据, 就没办法直接hit cache了, 而是需要重新更新cache, 导致cache失败, 这就是所谓的"伪共享", 其实就是false sharing. <br>

<font color=#0099ff>怎样解决呢? </font><br>

之前有说过, 一般的cpu cache line大小是64B, 也就是能够存储8个Int64(long)数据, 所以如果将结构设置成下面:

```
struct Sequence {
    public long p1, p2, p3, p4, p5, p6, p7;
    private volatile long cursor = INITIAL_CURSOR_VALUE;
    public long p8, p9, p10, p11, p12, p13, p14;
}
```
上面的结构中实际值是cursor, 前面的p1, p2, p3, p4, p5, p6, p7填充低地址7个long, 后面的p8, p9, p10, p11, p12, p13, p14
填充高地址7个long. 这样的设计导致不可能有两个cursor出现在同一个cpu cache line中, 就解决了"伪共享"问题! <br>

当然这样直接的代价就是增大的7倍的内存消耗空间! Orz... 不过确实是Disruptor这么快的原因之一. 但是个人觉得在一般的系统中感觉不需要这么
苛刻条件吧, LMAX做的金融交易系统中估计会比较严格一点. 不过这都看自己的取舍了. <br>

###2. Disruptor实现
之前有说过, Disruptor的实现是借助Ring Buffer结构, 那么到底是咋样的呢? <br>

1). 如下图所示:<br>

![3](/public/img/grocery/other/disruptor_3.jpg  "3")<br>

> a. 首先, 这个ring buffer本质上只是一个数组, 但是是作为环形队列来使用的. <br><br>
> b. 其大小需要设置为2^n大小. WHY? Disruptor中读取或者写数据都是根据序号Sequence来的, 但是这个sequence(序号)是一直递增的,
>    (不必当心递增到Int64最大值后怎么办, 可以算一下Int64的值, 就知道需要几百年才能达到这个值, 哈哈.) 那么我们就需要把sequence
>    映射到实际的在ring buffer中下标, 一般的做法是直接取模就好(X%Y), 但是取模操作台慢了. 如果总的大小是2^n, 那么我们直接
>    X&(size-1)就得到实际的在ring buffer中的下标值了. 这是基本的位运算了, 不会的可以google哈~

<br>
2). 如下图所示:<br>

![4](/public/img/grocery/other/disruptor_4.jpg  "4")<br>

当生产者和消费者在独立执行的时候, Disruptor使用了Barrier来控制生产者和消费者的写和读过程. 对于生产者来说, 消费者的消费位置就是
它的Barrier, 如图所示, 消费者消费到了2号位置, 所以生产者生产序号转化成ring buffer中的index后不能超过2号, 相当于是一个Barrier
挡住了继续进行生产. 对于消费者来说也是一样的, 生产者的write cursor也是它的Barrier, 消费不能超过还没写的位置!<br>

<br>
3). ring buffer 结构

```
// SingleProducerSequencer.java
abstract class SingleProducerSequencerPad extends AbstractSequencer
{
    protected long p1, p2, p3, p4, p5, p6, p7;

    public SingleProducerSequencerPad(int bufferSize, WaitStrategy waitStrategy)
    {
        super(bufferSize, waitStrategy);
    }
}

abstract class SingleProducerSequencerFields extends SingleProducerSequencerPad
{
    public SingleProducerSequencerFields(int bufferSize, WaitStrategy waitStrategy)
    {
        super(bufferSize, waitStrategy);
    }

    /**
     * Set to -1 as sequence starting point
     */
    protected long nextValue = Sequence.INITIAL_VALUE;
    protected long cachedValue = Sequence.INITIAL_VALUE;
}

public final class SingleProducerSequencer extends SingleProducerSequencerFields
{
    protected long p1, p2, p3, p4, p5, p6, p7;

    ...
}

上面的代码可以看到SingleProducerSequencer, 其中确实有cpu cache line padding,
上面的 protected long p1, p2, p3, p4, p5, p6, p7; 就是为了解决"伪共享"而设置.
```
<br>
4). 看一段生产者生产者的关键代码:

```
public long next(int n)
{
    if (n < 1)
    {
        throw new IllegalArgumentException("n must be > 0");
    }

    long current;
    long next;

    do
    {
        // 注意生产者的生产过程必须是互斥的, 也就是说不能覆盖其他线程的写操作, 所以下面需要CAS处理
        current = cursor.get();
        next = current + n;

        long wrapPoint = next - bufferSize;
        long cachedGatingSequence = gatingSequenceCache.get();

        // 如果写的位置不合法
        if (wrapPoint > cachedGatingSequence || cachedGatingSequence > current)
        {
            // 获取所有写线程中最小的gatingSequence, 即写线程能写的最小的ring buf中的index, 这个index
            // 之前表示是已经写过的!
            long gatingSequence = Util.getMinimumSequence(gatingSequences, current);

            // 下面说明ring buffer中的数据是满的, 消费者没有消费, 所以写线程必须要等待!
            if (wrapPoint > gatingSequence)
            {
                waitStrategy.signalAllWhenBlocking();
                LockSupport.parkNanos(1); // TODO, should we spin based on the wait strategy?
                continue;
            }

            // 否则设置新的gatingSequence
            gatingSequenceCache.set(gatingSequence);
        }

        // 否则取出一个sequence来放置数据, 注意此处使用的是CAS
        // lock free
        else if (cursor.compareAndSet(current, next))
        {
            break;
        }
    }
    // 如果没有取到, 那么这个生产者线程会一直running, 直到CAS之后的break
    while (true);

    return next;
}
```

上面的代码需要解释几个问题:<br>

> a. 之前有说过需要Barrier来限制读写操作, 此处又多了一个叫cachedGatingSequence, 这个其实能表示队列当前是否满,
>    cachedGatingSequence一般是缓存在当前写线程中最低的read cursor位置, 但是消费者还是会一直更新read cursor,
>    如果wrapPoint > cachedGatingSequence, 说明当前的队列满的, 可以画图体会一下...Orz... 所以如果出现这种情况,
>    那么就需要确定是不是最小的read cursor已经改变了, 也就是说cachedGatingSequence过期了, 所以需要Util.getMinimumSequence(gatingSequences, current)
>    然后继续这个循环, 直到可写!<br><br>
> b. 多个生产者中使用了lock-free机制, 即: cursor.compareAndSet(current, next)
>    之前已经说过, 使用CAS来代替锁的好处了.<br><br>
> c. 关于waitStrategy等待策略, Disruptor也提供了几种, 这个没研究太多, 具体的可以看相应的代码.

对于消费者来说, 核心的机制next函数和生产者的差不多, 具体就不解释了.

###3. Disruptor使用

有了上面的机制, 需要实现简单的队列就比较容易了, 一般来说有4类队列:<br>
> 一个生产者 - 一个消费者<br>
> 一个生产者 - 多个消费者<br>
> 多个生产者 - 一个消费者<br>
> 多个生产者 - 多个消费者<br>

上面的例子请看源代码中perftest/java/sequenced文件夹中例子. <br>

<a href="https://github.com/LMAX-Exchange/disruptor"  target="_blank">Disruptor代码</a> <br>

Disruptor实现了一个很强大的功能, 请看下图: <br>

![5](/public/img/grocery/other/disruptor_5.png "5")<br>

这张图涉及到多个队列, C1和C2从P1读取数据并且将数据处理后, 放入新的队列后让C3使用, 这样的话, 我们就需要搞4个队列, holy shit, Oh, sorry!
好像有点麻烦啊~ 而Disruptor可以将这个所有的整成一个ring buffer队列就OK了. 怎么实现的呢? 看下图 <br>

![6](/public/img/grocery/other/disruptor_6.png  "6")<br>

对于P1->C1和P1->C2, 根据前面的解释, 我们使用"一个生产者 - 多个消费者"模式就能解决. 但是C1->C3和C2->C3怎么处理呢? <br>

Disruptor有一个很强大的Group Consumer, 也就是说, 将上面的C1和C2作为level 1的消费者组, C3作为level 2的消费者组. 那么怎么处理的呢?
本质还是需要依赖Barrier!!! C1和C2的Barrier是P1, C3的Barrier是C1和C2的cursor, P1的Barrier是C3的cursor! 哇塞! 好像搞定了耶!<br>
但是还有一个问题: C3怎么取得C1和C2的数据呢? 那么这个只能在自己的ring buffer结构中进行设计了, 那么在C1和C2读取P1的数据后, 再将自己的数据
写进ring buffer中这样C3就能获得所有的数了.

```
struct XXX {
    P1_Data long
    C1_Data long
    C2_Data long
}
这样P1,C1和C2将自己的数据写入对应的字段就OK!!!
至于P1,C1,C2以及C3怎么去生产和消费, 是Disruptor帮你控制好了! 这个太赞了!
```
上面机制的实现代码如下:

```
// 创建一个barrier, 这个是依赖生产者的barrier
ConsumerBarrier b1 = ringBuffer.createConsumerBarrier();

// C1和C2的barrier是上面的b1
BatchConsumer c1 = new BatchConsumer(b1, handler1);
BatchConsumer c2 = new BatchConsumer(b1, handler2);

// 将C1和C2共同的序号设置为C3的barrier
ConsumerBarrier b2 = ringBuffer.createConsumerBarrier(c1, c2);
BatchConsumer c3 = new BatchConsumer(b2, handler3);

// 最后: 生产者的barrier是C3的序号
ProducerBarrier producerBarrier = ringBuffer.createProducerBarrier(c3);
```
具体的一些实现还是看工程中的例子吧.

###4. 这些天自己也根据一些开源代码完全山寨了一个go版本的代码: <a href="https://github.com/shanshanpt/disruptor_go"  target="_blank">点我点我点我</a> <br>

###5. 参考
<a href="http://ifeve.com/disruptor/"  target="_blank">并发框架Disruptor译文</a> <br>
<a href="https://github.com/LMAX-Exchange/disruptor"  target="_blank">Disruptor github</a> <br>

















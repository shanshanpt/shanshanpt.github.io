---
layout: post
title: Nats 消息机制 --- client端
category: 技术
tags: nats
keywords:
description:
---

之前有写过一篇文章关于Nats的使用: <a href="http://shanshanpt.github.io/2016/05/05/go-nats.html" target="_blank">Go语言下使用 nats 消息机制</a>.
我们知道是Nats有broker的, 关于什么是broker, 随便找了个链接<a href="http://www.oschina.net/question/1050447_144089" target="_blank">broker</a>.
其实本质就是server端. 本篇主要讲nats client端的实现, 虽然知道client端没什么卵用, 但是对于理解publish subscribe, request reply以及Queue还是有点帮助的.

<br> 本篇主要从publish, subscribe, request等功能函数入手, 慢慢解释大概的流程.

<br>
### 1. publish
publish是用于发布消息的函数, 这个函数相对比较简单, 本质上是将数据封装封装, 然后发送给server. 代码如下:

```
// publish is the internal function to publish messages to a nats-server.
// Sends a protocol data message by queuing into the bufio writer
// and kicking the flush go routine. These writes should be protected.
// 关于参数:
// subj是必须的, data是必须的
// reply是可选的, 如果subscribe方接收到本Msg后需要返回消息, 那么就是按照这个reply主题返回的!
// 如果是空, 说明subscribe方不需要返回消息
func (nc *Conn) publish(subj, reply string, data []byte) error {
	if nc == nil {
		return ErrInvalidConnection
	}
	if subj == "" {
		return ErrBadSubject
	}
	nc.mu.Lock()

	// Proactively reject payloads over the threshold set by server.
	// 检测data大小, 超过最大payload是不可的
	var msgSize int64
	msgSize = int64(len(data))
	if msgSize > nc.info.MaxPayload {
		nc.mu.Unlock()
		return ErrMaxPayload
	}
    // 检测conn是不是正常
	if nc.isClosed() {
		nc.mu.Unlock()
		return ErrConnectionClosed
	}

	// Check if we are reconnecting, and if so check if
	// we have exceeded our reconnect outbound buffer limits.
	// 检测是不是重连, 如果是, 检测pending数据长度是不是超过最大的buf-size了
	if nc.isReconnecting() {
		// Flush to underlying buffer.
		nc.bw.Flush()
		// Check if we are over
		if nc.pending.Len() >= nc.Opts.ReconnectBufSize {
			nc.mu.Unlock()
			return ErrReconnectBufExceeded
		}
	}

    // 下面几步是封装数据, 此处会发送两次Msg给broker(server)
    // 第一次发送msg header消息, 第二次发送data数据

	// 首先封装msg header
	msgh := nc.scratch[:len(_PUB_P_)]
	// 将主题subj封装
	msgh = append(msgh, subj...)
	// 空格分开
	msgh = append(msgh, ' ')
	// 如果reply存在,接在后面
	if reply != "" {
		msgh = append(msgh, reply...)
		msgh = append(msgh, ' ')
	}

	// We could be smarter here, but simple loop is ok,
	// just avoid strconv in fast path
	// FIXME(dlc) - Find a better way here.
	// msgh = strconv.AppendInt(msgh, int64(len(data)), 10)
	// 下面这个很有意思: 目的是将data长度放进b中
	// 例如长度是110, 那么b变成0 0 0 0 0 0 0 0 0 '1' '1' '0'
	// 最后三位代表的就是data长度
	var b [12]byte
	var i = len(b)
	if len(data) > 0 {
		for l := len(data); l > 0; l /= 10 {
			i -= 1
			b[i] = digits[l%10]
		}
	} else {
		i -= 1
		b[i] = digits[0]
	}
	// 将data长度写入 & CRLF
	msgh = append(msgh, b[i:]...)
	msgh = append(msgh, _CRLF_...)

	// FIXME, do deadlines here
	// 写入header
	_, err := nc.bw.Write(msgh)
	// 如果上面成功, 那么继续写入data
	if err == nil {
		_, err = nc.bw.Write(data)
	}
	// 如果写入data成功, 那么写入结束符
	if err == nil {
		_, err = nc.bw.WriteString(_CRLF_)
	}
	if err != nil {
		nc.mu.Unlock()
		return err
	}
    // 统计发送的字符数
	nc.OutMsgs++
	nc.OutBytes += uint64(len(data))

	if len(nc.fch) == 0 {
		nc.kickFlusher()
	}
	nc.mu.Unlock()
	return nil
}
```
总体来说, 就是封装header, 发送给server; 封装data, 发送给server. 需要注意的是reply参数是可以为空的, 为空说明subscribe方不需要回复消息.

<br>
### 2. subscribe
subscribe需要将自己的订阅信息发送给broker(server), 这里会涉及到接收消息的同步异步问题. 首先来看一下subscribe的参数有哪些,

```
func (nc *Conn) subscribe(subj, queue string, cb MsgHandler, ch chan *Msg) (*Subscription, error) {...}
```
> subj: 主题参数, 是必须的<br>
> queue: 当注册到一个queue中才会有这个参数, 一个queue中所有节点, 只有一个能够收到server发送的消息<br>
> cb: 回调函数, 用于异步订阅. 也就是说没有消息的时候不会阻塞<br>
> ch: 用于同步订阅, 没有收到消息的时候会阻塞, 使用channel实现<br>

下面看存在哪些调用场景:

```
// 本函数属于正常的异步subscribe函数, queue=_EMPTY_, 并且是异步的, chan=nil
func (nc *Conn) Subscribe(subj string, cb MsgHandler) (*Subscription, error) {
	return nc.subscribe(subj, _EMPTY_, cb, nil)
}

// 使用chan, queue=_EMPTY_, 回调函数=nil, 通过channel来同步订阅
func (nc *Conn) ChanSubscribe(subj string, ch chan *Msg) (*Subscription, error) {
	return nc.subscribe(subj, _EMPTY_, nil, ch)
}
// 类似于上面的ChanSubscribe函数
func (nc *Conn) SubscribeSync(subj string) (*Subscription, error) {
	if nc == nil {
		return nil, ErrInvalidConnection
	}
	mch := make(chan *Msg, nc.Opts.SubChanLen)
	s, e := nc.subscribe(subj, _EMPTY_, nil, mch)
	if s != nil {
		s.typ = SyncSubscription
	}
	return s, e
}

// 异步queue, 本次订阅节点属于queue, 接收消息的方式是通过回调函数异步处理
func (nc *Conn) QueueSubscribe(subj, queue string, cb MsgHandler) (*Subscription, error) {
	return nc.subscribe(subj, queue, cb, nil)
}

// 与上面的函数不一样, 这个是通过channel同步处理接收消息
func (nc *Conn) QueueSubscribeSync(subj, queue string) (*Subscription, error) {
	mch := make(chan *Msg, nc.Opts.SubChanLen)
	s, e := nc.subscribe(subj, queue, nil, mch)
	if s != nil {
		s.typ = SyncSubscription
	}
	return s, e
}
```

下面具体看一下subscribe函数实现:

```
// subscribe is the internal subscribe function that indicates interest in a subject.
func (nc *Conn) subscribe(subj, queue string, cb MsgHandler, ch chan *Msg) (*Subscription, error) {
    // 首先是一堆检测......
	if nc == nil {
		return nil, ErrInvalidConnection
	}
	nc.mu.Lock()
	// ok here, but defer is generally expensive
	defer nc.mu.Unlock()
	defer nc.kickFlusher()

	// Check for some error conditions.
	if nc.isClosed() {
		return nil, ErrConnectionClosed
	}

	if cb == nil && ch == nil {
		return nil, ErrBadSubscription
	}

    // 封装"订阅信息"
	sub := &Subscription{Subject: subj, Queue: queue, mcb: cb, conn: nc}
	// Set pending limits.
	sub.pMsgsLimit = DefaultSubPendingMsgsLimit
	sub.pBytesLimit = DefaultSubPendingBytesLimit

	// If we have an async callback, start up a sub specific
	// Go routine to deliver the messages.
	// 如果有cb回调函数, 那么属于异步方式
	if cb != nil {
		sub.typ = AsyncSubscription
		sub.pCond = sync.NewCond(&sub.mu)
		// 异步方式会开辟一个新的协程来等待接收消息
		go nc.waitForMsgs(sub)
	} else {
	    // 否则属于同步方式
		sub.typ = ChanSubscription
		sub.mch = ch
	}
    // 记录id
	sub.sid = atomic.AddInt64(&nc.ssid, 1)
	nc.subs[sub.sid] = sub

	// We will send these for all subs when we reconnect
	// so that we can suppress here.
	// 将订阅请求发送给server
	if !nc.isReconnecting() {
		nc.bw.WriteString(fmt.Sprintf(subProto, subj, queue, sub.sid))
	}
	return sub, nil
}
```
通过上面的代码我们知道, 对于同步和异步的处理方式是不一样的, 如果是是同步, 那么subscribe这边会等待channel消息, 如果是异步,
subscribe开辟一个协程来等待接收消息waitForMsgs. 关于的具体的消息循环, 最后在一起总结.

<br>
### 3. Request

Request的本质其实还是publish和subscribe, 只不过这次的publish是带reply参数的, 用于subscribe方返回消息, 本方接收. 看具体代码:

```
// Request will create an Inbox and perform a Request() call
// with the Inbox reply and return the first reply received.
// This is optimized for the case of multiple responses.
// 发送Request请求, 本质上还是sub/pub
func (nc *Conn) Request(subj string, data []byte, timeout time.Duration) (m *Msg, err error) {
	// 第一步: 随机一个用于reply的subj ==> ibox
	// 然后订阅这个subj, 用于接收responser的回复
	// 并且只接受第一个回复, 即s.AutoUnsubscribe(1), 收到一个Msg后就注销订阅

	// 随机一个reply字符串
	inbox := NewInbox()
	// 分配chan
	ch := make(chan *Msg, RequestChanLen)
	// 本方订阅这个inbox的主题, 用于接收subscribe的回复
	s, err := nc.subscribe(inbox, _EMPTY_, nil, ch)
	if err != nil {
		return nil, err
	}
	// 仅接收第一条消息
	s.AutoUnsubscribe(1)

	// 第二步: publish自己的请求, 并且将返回的Msg保存在m中
	err = nc.PublishRequest(subj, inbox, data)

	// 下面在规定时间内等待消息
	if err == nil {
		m, err = s.NextMsg(timeout)
	}
	// 注销订阅
	s.Unsubscribe()
	return
}

// NewInbox will return an inbox string which can be used for directed replies from
// subscribers. These are guaranteed to be unique, but can be shared and subscribed
// to by others.
func NewInbox() string {
	var b [inboxPrefixLen + 22]byte
	pres := b[:inboxPrefixLen]
	copy(pres, InboxPrefix)
	ns := b[inboxPrefixLen:]
	copy(ns, nuid.Next())
	return string(b[:])
}
```
Request其实就是一次publish/subscribe过程!


<br>
### 4. 消息接收流程

消息发送流程是很简单的, 直接publish给server就OK了, 接收消息是一个相对比较麻烦的过程, 首先看一下基本的消息接收框架.
![1](/public/img/grocery/nats/nats_recv_msg.png  "nats recv msg")<br>

上面流程是: 当connect到server的时候之后, 会进行一些Init的配置, 此时, 客户端会开辟一个新的go线程执行spinUpGoRoutines,
这个go线程中主要处理套接字的读写数据. 关于写套接字使用的是flusher, 这个比较简单, 不多说. 关于读套接字, 此处另开辟了一个新的
线程来执行readLoop函数. 这个函数用于循环从套接字中读取数据, 然后交给parser处理. parser会根据数据进行分析, 最终会调用pprocessMsg
来来处理数据, processMsg函数主要就是将数据的subj, reply和data分离, 然后根据数据的接收类型(同步或者异步)来进行不同的处理. 这个在下面具体说.
如果是同步数据, 会写入channel; 如果是异步数据, 会处理信号量, 通知waitForMsgs函数可以进行处理了. waitForMsgs函数是在subscribe函数中
调用的, 也是run在一个新的go线程中, 具体的可以看上面的subscribe函数中的代码. 最终在waitForMsgs函数中调用异步回调函数处理数据.

<br>
上面主要涉及到三个重要的函数: readLoop, processMsg以及waitForMsg, 下面主要讲解一下这些函数.

<br> 1). 首先看下readLoop函数代码:

```
// readLoop() will sit on the socket reading and processing the
// protocol from the server. It will dispatch appropriately based
// on the op type.
// 这个循环是在connect的时候开辟的线程, 用于从socket读取数据
func (nc *Conn) readLoop() {
	// Release the wait group on exit
	defer nc.wg.Done()

	// Create a parseState if needed.
	// 创建一个parse State
	nc.mu.Lock()
	if nc.ps == nil {
		nc.ps = &parseState{}
	}
	nc.mu.Unlock()

	// Stack based buffer.
	// b用于接收数据
	b := make([]byte, defaultBufSize)
    // 下面是一个大循环
	for {
		// FIXME(dlc): RWLock here?
		nc.mu.Lock()
		sb := nc.isClosed() || nc.isReconnecting()
		if sb {
			nc.ps = &parseState{}
		}
		// 获取连接
		conn := nc.conn
		nc.mu.Unlock()

		if sb || conn == nil {
			break
		}
		// 读取conn socket的数据 !!!
		n, err := conn.Read(b)
		if err != nil {
			nc.processOpErr(err)
			break
		}

		// 下面的parse函数很重要, 也很复杂, 目的是根据接收到的数据进行分发
		// 里面会调用processMsg函数处理数据
		if err := nc.parse(b[:n]); err != nil {
			nc.processOpErr(err)
			break
		}
	}
	// Clear the parseState here..
	nc.mu.Lock()
	nc.ps = nil
	nc.mu.Unlock()
}
```
readLoop函数的逻辑很简单, 即不断的从conn socket中读取数据, 然后将数据给parse处理, 接着继续读取数据.

<br> 2). processMsg函数代码:

```
// processMsg is called by parse and will place the msg on the
// appropriate channel/pending queue for processing. If the channel is full,
// or the pending queue is over the pending limits, the connection is
// considered a slow consumer.
// 处理data
func (nc *Conn) processMsg(data []byte) {
	// Lock from here on out.
	nc.mu.Lock()

	// Stats
	// 修改接收到的数据的数量
	nc.InMsgs++
	nc.InBytes += uint64(len(data))
	// 获取订阅信息结构
	sub := nc.subs[nc.ps.ma.sid]
	if sub == nil {
		nc.mu.Unlock()
		return
	}

	// Copy them into string
	// 获取主题 & reply
	subj := string(nc.ps.ma.subject)
	reply := string(nc.ps.ma.reply)

	// Doing message create outside of the sub's lock to reduce contention.
	// It's possible that we end-up not using the message, but that's ok.

	// FIXME(dlc): Need to copy, should/can do COW?
	// 拷贝数据
	msgPayload := make([]byte, len(data))
	copy(msgPayload, data)

	// FIXME(dlc): Should we recycle these containers?
	// 封装Msg
	m := &Msg{Data: msgPayload, Subject: subj, Reply: reply, Sub: sub}

	sub.mu.Lock()

	// Subscription internal stats
	// 填充Subscription一些信息
	sub.pMsgs++
	if sub.pMsgs > sub.pMsgsMax {
		sub.pMsgsMax = sub.pMsgs
	}
	sub.pBytes += len(m.Data)
	if sub.pBytes > sub.pBytesMax {
		sub.pBytesMax = sub.pBytes
	}

	// Check for a Slow Consumer
	// 如果超过限制, 那么进入慢消费
	if sub.pMsgs > sub.pMsgsLimit || sub.pBytes > sub.pBytesLimit {
		goto slowConsumer
	}

	// We have two modes of delivery. One is the channel, used by channel
	// subscribers and syncSubscribers, the other is a linked list for async.
	//
	// 这一步是很重要的! 此处的处理数据分成同步和异步,
	// 1. 如果是同步,那么直接将m写入mch chan就OK
	// 2. 如果是异步,那么需要将数据放进sub管理的Msg链表中,并使用信号量sub.pCond.Signal()通知waitForMsgs函数进行处理
	//
	if sub.mch != nil {
		select {
		// 写入channel
		case sub.mch <- m:
		default:
			goto slowConsumer
		}
	} else {
		// Push onto the async pList
		// 将数据放入链表
		if sub.pHead == nil {
			sub.pHead = m
			sub.pTail = m
			// 给一个信号量! 这个很重要, 用于通知waitForMsgs进行处理
			sub.pCond.Signal()
		} else {
			sub.pTail.next = m
			sub.pTail = m
		}
	}

	// Clear SlowConsumer status.
	sub.sc = false

	sub.mu.Unlock()
	nc.mu.Unlock()
	return

slowConsumer:
    // 下面处理慢消费
	sub.dropped++
	nc.processSlowConsumer(sub)
	// Undo stats from above
	sub.pMsgs--
	sub.pBytes -= len(m.Data)
	sub.mu.Unlock()
	nc.mu.Unlock()
	return
}
```
processMsg函数获取数据, 并根据数据的同步/异步来进行不同的处理. 具体的可以看代码中的注释.

<br> 3). 最后看下waitForMsgs函数代码:

```
// waitForMsgs waits on the conditional shared with readLoop and processMsg.
// It is used to deliver messages to asynchronous subscribers.
// 这个函数和readLoop and processMsg共享信号量, 如果获取信号量, 那么就开始处理数据
func (nc *Conn) waitForMsgs(s *Subscription) {
	var closed bool
	var delivered, max uint64

	for {
		s.mu.Lock()
		// 等待信号量
		if s.pHead == nil && !s.closed {
			s.pCond.Wait()
		}
		// Pop the msg off the list
		// Subscription中存在一个链表用于保存所有的异步的Msg
		// 获得第一条数据
		m := s.pHead
		if m != nil {
			// 链表指向下一条数据
			s.pHead = m.next
			if s.pHead == nil {
				s.pTail = nil
			}
			s.pMsgs--
			s.pBytes -= len(m.Data)
		}
		// 获取回调函数
		mcb := s.mcb
		max = s.max
		closed = s.closed
		if !s.closed {
			s.delivered++
			delivered = s.delivered
		}
		s.mu.Unlock()

		if closed {
			break
		}

		// Deliver the message.
		// 下面调用这个回调函数, 完成一次处理
		if m != nil && (max <= 0 || delivered <= max) {
		    // 回调函数被执行
			mcb(m)
		}
		// If we have hit the max for delivered msgs, remove sub.
		if max > 0 && delivered >= max {
			nc.mu.Lock()
			nc.removeSub(s)
			nc.mu.Unlock()
			break
		}
	}
}
```
至此, subscriber接收消息的流程就清楚了!

<br>关于nats-server的逻辑, 有时间去看看...
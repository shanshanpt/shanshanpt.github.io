---
layout: post
title: Go语言最简单的tcp server/client
category: 技术
tags: GO
keywords:
description:
---

Go语言将网络库封装的非常好, 使用起来非常方便. 基本的步骤和<a href="http://blog.csdn.net/shanshanpt/article/details/7372649" target="_blank">C语言版本</a>的是差不多的, 只是操作更easy.
下面直接看下代码:<br>

###Server端<br>

```
package main

import (
	"flag"
	"fmt"
	"time"
	"bufio"
	"net"
	"os"
	"encoding/json"
)

var host = flag.String("host", "", "host")
var port = flag.String("port", "9999", "port")

type Msg struct {
	Data string `json:"data"`
	Type int    `json:"type"`
}

type Resp struct {
	Data string `json:"data"`
	Status int  `json:"status"`
}

func main() {
	// 解析参数
	flag.Parse()
	var l net.Listener
	var err error
	// 监听
	l, err = net.Listen("tcp", *host+":"+*port)
	if err != nil {
		fmt.Println("Error listening:", err)
		os.Exit(1)
	}
	defer l.Close()

	fmt.Println("Listening on " + *host + ":" + *port)

	for {
		// 接收一个client
		conn, err := l.Accept()
		if err != nil {
			fmt.Println("Error accepting: ", err)
			os.Exit(1)
		}

		fmt.Printf("Received message %s -> %s \n", conn.RemoteAddr(), conn.LocalAddr())

		// 执行
		go handleRequest(conn)
	}
}

// 处理接收到的connection
//
func handleRequest(conn net.Conn) {
	ipStr := conn.RemoteAddr().String()
	defer func() {
		fmt.Println("Disconnected :" + ipStr)
		conn.Close()
	}()

	// 构建reader和writer
	reader := bufio.NewReader(conn)
	writer := bufio.NewWriter(conn)

	for {
		// 读取一行数据, 以"\n"结尾
		b, _, err := reader.ReadLine()
		if err != nil {
			return
		}
		// 反序列化数据
		var msg Msg
		json.Unmarshal(b, &msg)
		fmt.Println("GET ==>  data: ", msg.Data, " type: ", msg.Type)

		// 构建回复Msg
		resp := Resp{
			Data: time.Now().String(),
			Status: 200,
		}
		r, _ := json.Marshal(resp)

		writer.Write(r)
		writer.Write([]byte("\n"))
		writer.Flush()
		//conn.Write(r)
		//conn.Write([]byte("\n"))
	}

	fmt.Println("Done!")
}

```

###Client端<br>

```
package main

import (
	"bufio"
	"flag"
	"fmt"
	"net"
	"os"
	"strconv"
	"sync"
	"encoding/json"
)

var host = flag.String("host", "localhost", "host")
var port = flag.String("port", "9999", "port")

type Msg struct {
	Data string `json:"data"`
	Type int    `json:"type"`
}

type Resp struct {
	Data string `json:"data"`
	Status int  `json:"status"`
}

func main() {
	flag.Parse()
	conn, err := net.Dial("tcp", *host+":"+*port)
	if err != nil {
		fmt.Println("Error connecting:", err)
		os.Exit(1)
	}
	defer conn.Close()
	fmt.Println("Connecting to " + *host + ":" + *port)
	// 下面进行读写
	var wg sync.WaitGroup
	wg.Add(2)
	go handleWrite(conn, &wg)
	go handleRead(conn, &wg)
	wg.Wait()
}

func handleWrite(conn net.Conn, wg *sync.WaitGroup) {
	defer wg.Done()
	// write 10 条数据
	for i := 10; i > 0; i-- {
		d := "hello " + strconv.Itoa(i)
		msg := Msg{
			Data: d,
			Type: 1,
		}
		// 序列化数据
		b, _ := json.Marshal(msg)
		writer := bufio.NewWriter(conn)
		_, e := writer.Write(b)
		//_, e := conn.Write(b)
		if e != nil {
			fmt.Println("Error to send message because of ", e.Error())
			break
		}
		// 增加换行符导致server端可以readline
		//conn.Write([]byte("\n"))
		writer.Write([]byte("\n"))
		writer.Flush()
	}
	fmt.Println("Write Done!")
}

func handleRead(conn net.Conn, wg *sync.WaitGroup) {
	defer wg.Done()
	reader := bufio.NewReader(conn)
	// 读取数据
	for i := 1; i <= 10; i++ {
		//line, err := reader.ReadString(byte('\n'))
		line, _, err := reader.ReadLine()
		if err != nil {
			fmt.Print("Error to read message because of ", err)
			return
		}
		// 反序列化数据
		var resp Resp
		json.Unmarshal(line, &resp)
		fmt.Println("Status: ", resp.Status, " Content: ", resp.Data)
	}
	fmt.Println("Read Done!")
}

```

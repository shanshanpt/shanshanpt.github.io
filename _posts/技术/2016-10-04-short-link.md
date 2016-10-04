---
layout: post
title: 短链接 设计
category: 技术
tags: 其他技术
keywords:
description:
---

闲来无聊, 看了下短链的设计方法, 原以为很简单的东东, 没想到讨论的还挺多的. Orz...

### 1.短链是啥?
顾名思义就是在形式上比较短的网址。可以在这个网址试试看: <a href="http://www.surl.sinaapp.com/"  target="_blank">链接</a>.
我测试的这个, "http://www.baidu.com", 生成的短链是: "http://t.cn/h5mwx". <br>
短链的意义在于, 例如: 1.内容限制字数, 如果让链接太长占用了字数, 其实是不值得的, 所以短链还是很有必要的.
2.可以对一系列的网址进行流量，点击等统计。

### 2.短链一般生成方法
> 1).将长链接编码成md5, 我们知道md5对于任意长度的内容都能编码到相等长度, md5有32位和16位, 此处我们使用32位编码. 不是很清楚md5的请: <a href="http://www.google.com/"  target="_blank">查询</a>. <br>

> 2).对于32位的md5, 我们将其分成4组, 每组是8个字符组成, 对于每组都会生成一个短链字符串.(md5包含0-9,a-f) <br>

> 3).每次取8个字节, 将其看成16进制串, 所以先将这组串转成int64数字, 然后与0x3fffffff(30位)与操作, 超过30位的忽略处理(原因在于, 生成的短链是6个字符长度, 如果按照每5位生成一个字符, 那么30个够了...BUT:为什么一定是6个字符, 没查过, Orz..)<br>

> 4).这30位分成6份(上面说的6个字符), 每5位的数字作为字母表(见下面)的索引取得特定字符(具体怎么获得: base & 0x0000003D), 依次进行获得6个字符短链串<br>

> 5).那么根据md5串可以获得4个6字符短链, 取里面的任意一个就可作为这个长url的短url地址<br>

> 6).将生成的短链放入缓存(例如redis), 每次client访问server的时候, 直接比对就OK.<br>

几个问题:<br>
1). 上面说的字母表, 其实就是0-9,a-z,A-Z的组成:

```
// 短链字符: a-z 0-9 A-Z
var Codes = []byte{'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
	'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
	'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5',
	'6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
	'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
	'U', 'V', 'W', 'X', 'Y', 'Z'}
```

2). 生成的短链是6个字符, 伪码如下: (go语言)

```
// 首先every8Chars是md5中的一组子串, 8个字符
// 所有的数据支取后面30bits
base := every8Chars & 0x3FFFFFFF
// 数组保存6个字符
result := make([]byte, 6)
// 下面生成6个字符
for j := 0; j < 6; j++ {
    // 0x0000003D = 61, 所以0x0000003D & out保证生成的数载0~61, 所以其实就是Codes的所有下标
	idx := 0x0000003D & base
	// 获取这个idx下标的字符
	result[j] = Codes[int(idx)]
	// 继续处理后面的bits
	base = base >> 5
}
```

3). 短链在理论上来说, 每次生成的必须是唯一的, 虽然md5码重复的可能性比较小, 但是还是存在这种可能的, 特别是此处生成了4组比较小的短链,
那么其实是增加的重复的概率. 那么没办法, 如果遇到重复的, 只能重新生成了(随机串?或者其他办法...Orz...). 所以说这也是一个隐形bug.<br>


4).完整地代码如下:

```
// 短链字符: a-z 0-9 A-Z
var Codes = []byte{'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
	'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
	'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5',
	'6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
	'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
	'U', 'V', 'W', 'X', 'Y', 'Z'}

func GenerateShortLink(longURL string) string {
	// 生成4个短链串
	loopNum := 4
	var urls []string
	var i int

	// long url转md5
	md5URL := md5.New()
	// 此处的"salt": 自定义字符串,防止算法泄漏
	_, err := io.WriteString(md5URL, "salt"+longURL)
	if err != nil {
		fmt.Println(err)
		return ""
	}
	md5Byte := md5URL.Sum(nil)
	md5Str := fmt.Sprintf("%x", md5Byte)

	for i = 0; i < loopNum; i++ {
		// 每8个字符是一个组
		each8BitsStr := md5Str[i*8 : i*8+8]
		// 将一组串转成16进制数字
		val, err := strconv.ParseInt(fmt.Sprintf("%s", each8BitsStr), 16, 64)
		if err != nil {
			fmt.Println(err)
			continue
		}
		// 获得一个新的短链
		urls = append(urls, genShortURL(val, i))
	}

	// 下面从上面的4个短链中随机一个作为当前的短链
	if len(urls) == 0 {
		return ""
	}

	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	idx := r.Intn(len(urls))
	return urls[idx]
}

// 32位的md5串中, 每8个字符作为一组, 计算得到一个6个字符的短链
func genShortURL(every8Chars int64, idx int) string {
	// 首先every8Chars是md5中的一组子串, 8个字符
	// 所有的数据支取后面30bits
	base := every8Chars & 0x3FFFFFFF
	// 数组保存6个字符
	result := make([]byte, 6)
	// 下面生成6个字符
	for j := 0; j < 6; j++ {
		// 0x0000003D = 61, 所以0x0000003D & out保证生成的数载0~61, 所以其实就是Codes的所有下标
		idx := 0x0000003D & base
		// 获取这个idx下标的字符
		result[j] = Codes[int(idx)]
		// 继续处理后面的bits
		base = base >> 5
	}
	return fmt.Sprintf("%s", result)
}
```

注意: 最终生成的短链会放在缓存中 ,譬如redis, 每次解析的时候去redis中查找就OK.

### 3.想要一个不重复的算法?
1). 之前已经说了, 不管怎样, 都可能存在重复, 那怎样不重复呢?有一种办法看起来是可以的, 如下:
> a-z A-Z 0-9 一共有62个字符, 可以得到不重复的组合数是: 62^6个组合(6个字符, 每个字符都有61种取法), 差不多有500多亿组合, 例如第一个组合是aaaaaa, 第二个是aaaaab,
以此类推, 那么我们能保证前500多亿个是不重复的, 这个量看起来是很多的, BUT...我们还是没有解决根本问题... 500多亿不可能覆盖所有的url ! <br>

2). 在知乎上看到一些大神在讨论这个问题, <a href="http://www.zhihu.com/question/29270034"  target="_blank">短 URL 系统是怎么设计的？</a>.

引用自知乎iammutex: "正确的原理就是通过发号策略，给每一个过来的长地址，发一个号即可，小型系统直接用mysql的自增索引就搞定了。
如果是大型应用，可以考虑各种分布式key-value系统做发号器。
不停的自增就行了。第一个使用这个服务的人得到的短地址是http://xx.xx/0 第二个是 http://xx.xx/1 第11个是 http://xx.xx/a
,依次往后，相当于实现了一个62进制(0-9,a-z,A-Z)的自增字段即可。<br>

简单的说: 自增发号器保证每次生成的id是唯一的, 那么这个对应的短链的字符串肯定是唯一的, 这样就绝对保证了不重复. 具体的一些details见知乎链接.

### 4.突然想到的一个小问题
之前都是讲算法的设计层面, 其实我们的短链服务的访问还需要提供一个accessToken, 不然被其他的一些非法的访问攻击, 造成很多资源浪费... Orz...我是不是想多了...


### 5.go写了一个简单的server和client

```
// server
//

package main

import (
	"fmt"
	"net/http"
	"io/ioutil"
	"encoding/json"
	"crypto/md5"
	"io"
	"strconv"
	"time"
	"math/rand"
	"errors"
)

// hash结构(此处代替redis, 在生产环境可以使用redis作为短链缓存)
var existed map[string]string

func main() {
	fmt.Println("ShortLink Server Start")
	existed = make(map[string]string)

	http.HandleFunc("/short_url", encodeToShort)
	http.HandleFunc("/long_url", decodeToLong)

	err := http.ListenAndServe("127.0.0.1:8000", nil)
	if err != nil {
		panic(err)
	}

}

// 将长链转短链
func encodeToShort(w http.ResponseWriter, r *http.Request)  {
	defer func() {
		if err := r.Body.Close(); err != nil {
			fmt.Println(err)
		}
	}()

	resp, err := ioutil.ReadAll(r.Body)
	if err != nil {
		fmt.Println(err)
		return
	}

	data := struct{
		LongURL string `json:"long_url"`
	}{}
	err = json.Unmarshal(resp, &data)
	fmt.Println("get long url: ", data.LongURL)

	shortURL := ""

	// 如果存在那么直接返回, 如果这样处理的话那么我们生成的是"永久短链映射"
	// 实际过程中可能需要"临时短链映射"
	value, exist :=  existed[data.LongURL]
	if exist {
		shortURL = value
	} else {
		shortURL = doEncode(data.LongURL)
		if shortURL == "" {
			panic(errors.New("generate short link error"))
		}
		// 加入hash(存入redis等), 长->短, 短->长 都加入hash表
		// 此处使用用一个hash表存储
		existed[data.LongURL] = shortURL
		existed[shortURL] = data.LongURL
	}
	bytes, err := json.Marshal(shortURL)
	fmt.Println(string(bytes))
	if err != nil {
		panic(err)
	}

	w.Write(bytes)
}

func doEncode(longURL string) string {
	// 生成4个短链串
	loopNum := 4
	var urls []string
	var i int

	// long url转md5
	md5URL := md5.New()
	// 此处的"salt": 自定义字符串,防止算法泄漏
	_, err := io.WriteString(md5URL, "salt"+longURL)
	if err != nil {
		fmt.Println(err)
		return ""
	}
	md5Byte := md5URL.Sum(nil)
	md5Str := fmt.Sprintf("%x", md5Byte)

	for i = 0; i < loopNum; i++ {
		// 每8个字符是一个组
		each8BitsStr := md5Str[i*8 : i*8+8]
		// 将一组串转成16进制数字
		val, err := strconv.ParseInt(fmt.Sprintf("%s", each8BitsStr), 16, 64)
		if err != nil {
			fmt.Println(err)
			continue
		}
		// 获得一个新的短链
		urls = append(urls, genShortURL(val, i))
	}

	// 下面从上面的4个短链中随机一个作为当前的短链
	if len(urls) == 0 {
		return ""
	}

	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	idx := r.Intn(len(urls))
	return urls[idx]
}

// 短链字符: a-z 0-9 A-Z
var Codes = []byte{'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
	'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
	'u', 'v', 'w', 'x', 'y', 'z', '0', '1', '2', '3', '4', '5',
	'6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
	'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T',
	'U', 'V', 'W', 'X', 'Y', 'Z'}

// 32位的md5串中, 每8个字符作为一组, 计算得到一个6个字符的短链
func genShortURL(every8Chars int64, idx int) string {
	// 首先every8Chars是md5中的一组子串, 8个字符
	// 所有的数据支取后面30bits
	base := every8Chars & 0x3FFFFFFF
	// 数组保存6个字符
	result := make([]byte, 6)
	// 下面生成6个字符
	for j := 0; j < 6; j++ {
		// 0x0000003D = 61, 所以0x0000003D & out保证生成的数载0~61, 所以其实就是Codes的所有下标
		idx := 0x0000003D & base
		// 获取这个idx下标的字符
		result[j] = Codes[int(idx)]
		// 继续处理后面的bits
		base = base >> 5
	}
	return fmt.Sprintf("%s", result)
}


// 短链到长链, 直接从hash表(redis)中读取
//
func decodeToLong(w http.ResponseWriter, r *http.Request)  {
	result := "Not existed!"

	data := struct{
		ShortURL string `json:"short_url"`
	}{}
	resp, err := ioutil.ReadAll(r.Body)
	if (err != nil) {
		panic(err)
	}
	err = json.Unmarshal(resp, &data)
	if (err != nil) {
		panic(err)
	}
	fmt.Println("get short url: ", data.ShortURL)

	value, exist := existed[data.ShortURL]
	if exist {
		result = value
	}

	bytes, err := json.Marshal(result)
	if err != nil {
		panic(err)
	}

	w.Write(bytes)
}
```

下面是一简单的client:

```
// client
//

package main

import (
	"fmt"
	"net/http"
	"strings"
	"io/ioutil"
	"encoding/json"
)

func main() {
	fmt.Println("ShortLink Client Start")

	// 测试获取短链
	type DATA struct{
		LongURL string `json:"long_url"`
	}
	v := DATA{
		LongURL:"http://127.0.0.1:8000/asasd/dfbdfb/dbdbd/dbdbdf/dbdbd",
	}
	bodyData, _ := json.Marshal(v)
	body := ioutil.NopCloser(strings.NewReader(string(bodyData)))

	client := &http.Client{}
	req, _ := http.NewRequest("POST", "http://127.0.0.1:8000/short_url", body)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded; param=value")
	resp, err := client.Do(req)

	defer resp.Body.Close()
	data, err := ioutil.ReadAll(resp.Body)
	var shortLink string
	// 注意json解码哦
	json.Unmarshal(data, &shortLink)
	fmt.Println(string(shortLink), err)


	// 测试获取长链
	type DATA2 struct {
		ShortURL string `json:"short_url"`
	}
	v2 := DATA2{
		ShortURL: string(shortLink),
	}
	bodyData2, _ := json.Marshal(v2)
	body2 := ioutil.NopCloser(strings.NewReader(string(bodyData2)))
	client2 := &http.Client{}
	req2, _ := http.NewRequest("POST", "http://127.0.0.1:8000/long_url", body2)
	req2.Header.Set("Content-Type", "application/x-www-form-urlencoded; param=value")
	resp2, err := client2.Do(req2)

	defer resp2.Body.Close()
	shortLink2, err := ioutil.ReadAll(resp2.Body)
	fmt.Println(string(shortLink2), err)
}
```

OK, 短链暂时就写这么多吧...
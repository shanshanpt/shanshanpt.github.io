---
layout: post
title:  varnish 配置语言 VCL
category: 技术
tags: 其他技术
keywords:
description:
---

文章简单翻译+自述from: <a href="http://www.varnish-cache.org/docs/3.0/reference/vcl.html"  target="_blank">VCL</a>. <br>

###1. 简介

VCL是用于Varnish cache配置的语言, 当加载一个vcl文件的时候, varnishd management进程会首先将这个文件编译成C代码, 然后再动态link到相关的进程去.

###2. 语法

VCL类似于C和Perl, 语法比较简单. 每个函数块是以{}界定, 同时, 每条语句是需要加上 ; 结束的. <br>
还有和C类似的是, = 代表赋值, ==, !=代表比较, ||, ! 和 && 是bool操作, VCL语言还支持正则表达式, 可以使用 ~ 和 !~ 来进行正则匹配. <br>
基本字符串还是使用"xxxxx", 引号来表示, 不过需要注意, 字符串不能换行, 也就是说, 只能在一行书写. <br>
长字符串使用 {" ... "}表示, 这个字符串可以包含任何字符, 包括 " 本身, 换行符 \n, 以及其他的控制字符, BUT, 除了NUL (0x00). strings之间可以使用
 + 连接. <br>
我们可以使用 set 关键字来给变量进行赋值, 注意, VCL中没有用户自定义的变量, 这里只有定义在backend(后面会讲)中的变量, request 或者 document objects(这个不知道咋翻译,orz...).
我们可以使用set里来操作http的header, 例如可以移除header中一些变量, 或者赋值都是可以的. 我们可以使用rollback关键词来revert对于request的任何改变. <br>
synthetic关键词用于在vcl_error中构建一个虚假的response. 它需要一个字符串作为参数.<br>
panic关键词用于是的client进程被强制crash, panic也需要一个字符串作为参数. <br>
return(action)关键词用于结束子程序(可以理解成结束这个函数), 参数action可以如下:<br>
> deliver <br>
> error <br>
> fetch <br>
> hash <br>
> hit\_for\_pass <br>
> lookup <br>
> ok <br>
> pass <br>
> pipe <br>
> restart <br>

VCL有if语句, 但是没有类似于for这样的循环语句. <br>
最后, 我们可以使用include将其他的VCL文件包含到本VCL文件中来. (这个和Makefile, 以及平常的编程语言都是很相似的.)<br>

###3. Backend

声明一个backend变量, 可以理解成是定义一个server结构:

```
backend www {
  .host = "www.example.com";
  .port = "http";
}
```
这个backend变量在后面的request请求中可以用到:

```
# 一个判断, 如果host不满足条件, 那么将request的backend设置为上面的那个server
if (req.http.host ~ "(?i)^(www.)?example.com$") {
  set req.backend = www;
}
```
为了避免backend server过载, ```.max_connections```可以用来指定连接到当前backend server的最大连接数. <br>
backend中还可以定义timeout参数, 主要有三类:<br>

> .connect\_timeout: backend等待连接超时时间<br>

> .first\_byte\_timeout: 等待第一个字节到来超时时间<br>

> .between\_bytes\_timeout: 接收每个字节之间超时时间<br>

如下所示:

```
backend www {
  .host = "www.example.com";
  .port = "http";
  .connect_timeout = 1s;
  .first_byte_timeout = 5s;
  .between_bytes_timeout = 2s;
}
```

.saintmode\_threshold用于表示当前的backend是否健康, .saintmode\_threshold可以是任意值, 新建connection就会在
saintmode list中增加一项, 当数量超过.saintmode\_threshold表明backend不健康了.


###4. Directors

VCL 可以把多个 backends 聚合成一个组, 这些组被叫做 director, 这样可以增强性能和弹力, 当组里一个 backend 挂掉后, 可以选择另一个健康的 backend.
VCL 有多种 director, 不同的 director 采用不同的算法选择 backend. 一个Director可能如下:

```
director b2 random {
  // .retries 参数表示尝试找到一个 backend 的最大次数
  .retries = 5;
  {
    // We can refer to named backends
    // b1是我们在前面已经定义的backend, 分配权值7
    .backend = b1;
    .weight  = 7;
  }
  {
    // Or define them inline
    // 也可以在内部定义一个backend
    .backend  = {
      .host = "fs2";
    }
    .weight = 3;
  }
}
```

<br>
####1). Random directors

Random方法中包含三种director如下, 之所以它们都属于random，是因为他们使用的内在逻辑都是相同的, 三种director仅仅是随机策略不一样而已. <br>
> random director: 使用一个随机数作为种子<br>

> client director: 根据client的session cookie等来确定server<br>

> hash director: 使用URL的hash值来访问相应的机器<br>

在Random方法中, .weight是必须要的, 用于指定每个backend之间的权值, 权值大的会被大概率优先访问, 所以大权值的server上流量更大. <br>
.retries表示尝试寻找一个健康的server的次数. 即, 如果一次没有找到合适的server, 那么会继续尝试寻找直到找了.retries次. <br>

<br>
####2). Round-robin director

这个简单, 就是一次将流量导到server中去, 第一个请求给第一个server, 第二个请求给第二个server... 如果遇到不健康的server或者varnish连不上的server,
那么这个server会被skip. 在找到合适的backend之前, 这个会一直去循环寻找server. <br>

<br>
####3). DNS director

DNS director可以使用random 和 round-robin来选择后端, 也可以使用list方法选择后端如下:

```
director directorname dns {
    .list = {
        .host_header = "www.example.com";
        .port = "80";
        .connect_timeout = 0.4s;
        "192.168.15.0"/24;
        "192.168.16.128"/25;
    }
    .ttl = 5m;
    .suffix = "internal.example.net";
}
```
上面定义了一个server的list, 里面包含了多少server呢? 384个server, 怎么计算的? 这有点简单啊, 根据IP和掩码来计算合法的IP, 其数量就是合法的server数量.
上面的servers都使用80端口, 连接超时时间都是0.4s. 需要注意, .list中所有的选项都必须定义在ip之前. 同时, .list不支持IPv6.
它不是一个白名单, 它只是一个在varnish内部创建的实际的后端服务器列表, 定义的子网越大开销越大.<br>
.ttl定义了DNS的查询时间.<br>
.suffix表示把其后面的值，追加到客户端提供的Host Header中.<br>
此director不支持健康检测. <br>
支持DNS轮询负载均衡. 如果主机名解析后对应多个后端服务器, 那么这director将以轮询的方式分派流量. <br>

<br>
####4). fallback director

fallback director选择第一个健康可用的后端服务器,
它是以服务器定义在list中的顺序依次进行选择的, 如果第一个服务器可用, 它不会再去尝试连接第二个服务器, 除非第一个服务器不可用了. <br>

```
director b3 fallback {
  { .backend = www1; }
  { .backend = www2; } // will only be used if www1 is unhealthy.
  { .backend = www3; } // will only be used if both www1 and www2
                       // are unhealthy.
}
```

###5. Backend probes (backend探测)

后端服务器可以通过req.backend.healthy变量返回的探测状态来判断是否可用. <br>

探测器可以跟的参数有：<br>

>  .url 表示指定一个发送到后端服务器的URL请求，默认值是“/”. <br>

>  .request 表示指定一个完整的多字符串的HTTP请求，每个字符串后面都会自动的插入\r\n 回车换行符. 它的优先级比.url高. <br>

>  .window 表示我们要检查确定后端服务器的可用性，所要进行探测的次数. 默认是8次. <br>

>  .threshold 表示在选项.window中，要成功的探测多少次我们才认为后端服务器可用. 默认是3次. <br>

>  .initial 表示当varnish启动的时候，要探测多少次后则认为服务器可用. 默认值和选项.threshold的值的相同. <br>

>  .expected_response 表示你期望后端所返回的HTTP响应代码. 默认是200. <br>

>  .interval 表示每隔多少秒探测一次. 默认是每5秒探测一次. <br>

>  .timeout 表示每次探测所使用的时间，如果超过设定的时间，就表示此次才探测超时，也就表示此次探测失败. 默认是2秒. <br>

我们可以定义一个探测器, 这个探测器是放在backend中的, 如下: <br>

```
backend www {
  .host = "www.example.com";
  .port = "http";
  .probe = {
    .url = "/test.jpg";
    .timeout = 0.3 s;
    .window = 8;
    .threshold = 3;
    .initial = 3;
  }
}
```

也可以单独定义: <br>

```
probe healthcheck {
   .url = "/status.cgi";
   .interval = 60s;
   .timeout = 0.3 s;
   .window = 8;
   .threshold = 3;
   .initial = 3;
   .expected_response = 200;
}

backend www {
  .host = "www.example.com";
  .port = "http";
  .probe = healthcheck;
}
```

同时, 也可指定一个原始的HTTP请求: <br>

```
probe rawprobe {
    # NB: \r\n automatically inserted after each string!
    .request =
      "GET / HTTP/1.1"
      "Host: www.foo.bar"
      "Connection: close";
}
```

###6. ACL

ACL的声明可以创建并初始化以指定名称的访问控制列表. 这个访问控制列表是被用来匹配客户端的地址的，例如：<br>

```
acl local {
    "localhost";    // myself
    "192.0.2.0"/24; // and everyone on the local network
    ! "192.0.2.23"; // except for the dialin router
}
```

如果ACL的一条记录指定了一个Varnish不能解析的主机名的话，那么它将与它比较的任何地址来进行匹配.
如果这个地址以逻辑非符号 ！开头的话，那么它将会拒绝与它比较的任何地址来匹配.
如果这条记录使用圆括号括起来，那么这条记录就被忽略了. <br>

一个匹配local的例子如下: <br>

```
# 如果匹配
if (client.ip ~ local) {
  return (pipe);
}
```

###7. Regular Expressions 正则表达式

varnish使用PCRE, 它是兼容Perl的正则表达式. 比如要打开不区分大小写功能，可以在一个圆括号中使用一个问号标记，如下：<br>

```
# If host is NOT example dot com..
if (req.http.host !~ "(?i)example.com$") {
    ...
}
```

###8. Functions函数

有以下一些内建函数: <br>

> ```hash\_data(str)```:表示添加一个字符串作为hash输入. 在default.vcl文件中，hash\_data()的调用主要是在host和URL的请求上. <br>

> ```regsub(str,regex,sub)```: 表示在字符串str中，使用sub来替换正则表达式首次匹配的字符. 在sub里，\0（也可写为\&）表示替换整个匹配的字符串. \n表示替换匹配的正则表达式中的第n个分组字符串. <br>

> ```regsuball(str,regex,sub)```:它和regsub()一样，但是替换的不是首次出现的而是所有的匹配内容. <br>

> ```ban(ban expression)```：禁止所有缓存中匹配表达式的对象. <br>

> ```ban\_url(regex)```：禁止所有缓存中配正则表达式的URLs. <br>

###9. Subroutines

Subroutines类似于函数, 使得代码更加清晰, 并且能够被重用. <br>

```
sub pipe_if_local {
  if (client.ip ~ local) {
    return (pipe);
  }
}
```

在VCL中的Subroutines不带参数，也没有返回值. 可以通过使用call关键字后跟子层序的名称来调用子程序，例如：```call pipe_if_local```. <br>

在varnish中, 有一些内嵌的Subroutines, 这些Subroutines和varnish工作流程相关.
这些子程序可以检查和操作HTTP头部、每个请求的其他的不同检查、和在一定能的程度上决定请求应该如何被处理.
每个子程序的结束可以通过调用少量关键字（按照你的期望输出的结果来选择关键字）中的一个来实现. <br>

此处插入一张图片为了下面的理解, 图片来自: <a href="http://tshare365.com/archives/2581.html"  target="_blank">点我</a>. <br>

![1](/public/img/grocery/other/varnish_1.png "1")<br>

注意: 上面图的代码在最后的EXAMPLE中会讲述! <br>

```
1.
vcl_init:
    它是当VCL加载，任何请求通过它之前调用的. 通常用于初始化VMODs.
    return()的返回值有：ok
    表示正常返回，VCL将继续加载.

2.
vcl_recv：(这是一个重要的Subroutines! ! !)
    它是在一个请求开始，完整的请求被接收和解析后调用. 它的目的是判定是否要为这个请求提供服务，
    应该如何处理它，如果可以处理它，又该为它选择哪个后端服务器.

    它结束时，可以通过return()调用的关键字有：
    error code[reason]：表示将指定的错误代码返回给客户端，并丢弃请求.
    pass：表示切换到pass模式. 最终，将控制权转交给vcl_pass.
    pipe：表示切换到pipe模式. 最终，将控制权转交给vcl_pipe.
    lookup: 表示在缓存中查找请求对象. 最终，控制权将转交给vcl_hit或vcl_miss，具体转交给谁，这要取决于对象是否在缓存中.
            此时，变量bereq.request的值将被设置为GET方法，而不管req.request的值是什么样.

3.
vcl_pipe：
    它是在要求进入pipe模式的时候调用. 在这种模式里，请求会被传递到后端服务器，并且不管后来的数据是来自客户端还是服务器都会不做任何改变的传送，一直到连接到关闭.
    它结束时，可以通过return()调用的关键字有：
    error code[reason]：表示将指定的错误代码返回给客户端，并丢弃请求
    pipe：表示使用pipe模式进行处理.

4.
vcl_pass：
    它是在进入pass模式的时候调用. 在这种模式里，请求会被直接发送给后端服务器，后端服务器的响应也会直接传递给客户端，
    但是请求的数据和响应的数据都不会进入缓存. 后续的由同一客户端提交的请求连接会正常被处理.
    它结束时，可以通过return()调用的关键字有：
    error code[reason]：表示将指定的错误代码返回给客户端，并丢弃请求
    pass：表示使用pass模式处理.
    restart：表示重启事务. 设置此值可以使重启计数器的计数增加, 如果重启的次数高于变量 max_restarts的次数，Varnish将会发出一个错误.

5.
vcl_hash:
    可在在此调用内嵌函数hash_data()，来对你想要添加哈希值的数据来添加hash值.
    它结束时，可以通过return()调用的关键字有：
    hash：表示进行哈希处理.

6.
vcl_hit:
    它是在所请求的文档在缓存中查找到之后调用的.
    它结束时，可以通过return()调用的关键字有：
    deliver：表示也许会先将对象插入到缓存中，然后在将它投递给客户端, 控制权最终会转交给vcl_deliver.
    error code[reason]:表示将指定的错误代码返回给客户端，并丢弃请求
    pass：表示切换至pass模式，控制权最终会转交给vcl_pass.
    restart：表示重启事务. 设置此值可以使重启计数器的计数增加.
             如果重启的次数高于变量 max_restarts的次数，Varnish将会发出一个错误.

7.
vcl_miss：
    它是在所请求的文档在缓存中没有查找到之后调用的. 它的目的是决定是否要尝试重新从后端服务器取回所请求的文档，并决定从哪个后端服务器取回.
    它结束时，可以通过return()调用的关键字有：
    error code[reason]:表示将指定的错误代码返回给客户端，并丢弃请求
    pass：表示切换至pass模式，控制权最终会转交给vcl_pass.
    fetch：表示重新从后端服务器取回所请求的对象. 控制权最终转交给vcl_fetch.

8.
vcl_fetch：
    它是在一个文档成功的从后端获取后调用.
    它结束时，可以通过return()调用的关键字有：
    error code[reason]：表示将指定的错误代码返回给客户端，并丢弃请求
    deliver：表示也许会先将对象插入到缓存中，然后在将它投递给客户端, 控制权最终会转交给vcl_deliver.
    hit_for_pass：表示传递从后端取回的数据. 使用此返回值将会创建hit_for_pass对象.
        需要注意的是hit_for_pass对象的TTL值是被设置为beresp.ttl的当前值.
        当前的请求将会由vcl_deliver处理，但是后续的基于hit_for_pass对象的请求将会直接由vcl_pass来处理.
    restart：表示重启事务. 设置此值可以使重启计数器的计数增加. 如果重启的次数高于变量 max_restarts的次数，Varnish将会发出一个错误.

9.
vcl_deliver：
    它是在缓存对象都递给客户端之前调用.
    它结束时，可以通过return()调用的关键字有：
    deliver：表示投递对象到客户端.
    restart：表示重启事务. 设置此值可以使重启计数器的计数增加.
        如果重启的次数高于变量 max_restarts的次数，Varnish将会发出一个错误.

10.
vcl_error：
    它是在当遇到一个错误的时候调用，这个错误时既可能明确是由于后端服务器引起的，也可能是由于varnish内部引起的不明显的错误.
    它结束时，可以通过return()调用的关键字有：
    deliver：表示投递错误对象给客户端.
    restart：表示重启事务. 设置此值可以使重启计数器的计数增加. 如果重启的次数高于变量 max_restarts的次数，Varnish将会发出一个错误.

11.
vcl_fini：
    它是仅在所有的请求退出VCL之后，VCL取消时调用, 通常用于清理VMODs.
    return()的返回值有：
    ok，表示正常返回，VCL将被取消.
```

如果上面的Subroutines在自己的.vcl文件中没有定义, 那么会使用varnish默认的函数处理.


###10. Multiple subroutines

之前已经说了, 使用include可以将其他的.vcl文件包含到本vcl文件中, 例如在我们的main.vcl中可能包含"backends.vcl"和"ban.vcl",
同时, 在"backends.vcl"和"ban.vcl"可能会定义重复函数名的函数, 那么这些函数在main.vcl中的执行顺序是根据代码出现的顺序来先后处理.
如下:

```
# in file "main.vcl", 包含下面两个字.vcl文件
include "backends.vcl";
include "ban.vcl";

# in file "backends.vcl" 中定义了vcl_recv函数
sub vcl_recv {
  if (req.http.host ~ "(?i)example.com") {
    set req.backend = foo;
  } elsif (req.http.host ~ "(?i)example.org") {
    set req.backend = bar;
  }
}

# in file "ban.vcl" 中也定义了vcl_recv函数
sub vcl_recv {
  if (client.ip ~ admin_network) {
    if (req.http.Cache-Control ~ "no-cache") {
      ban_url(req.url);
    }
  }
}
```

###11. Variables

全局变量还是很多的, 如下:

```
1.
now：表示当前的时间，以秒为单位，时间的计算是从epoch开始的. 当在字符串的上下文中使用时，它返回一个格式化后的字符串.


2.
以下的变量在backend的声明中是可用的：
  .host：后端服务器的主机名或IP地址. 
  .port：后端服务器的服务名称或端口号


3. 
以下的变量在处理一个请求的时候可用：
  client.ip: 表示客户端的IP地址. 
  client.identity: 表示客户端识别，常被用于client director的负载均衡. 
  server.hostname：表示服务器的主机名. 
  server.identity：表示服务器的身份标识，可以通过-i参数来设置. 如果没有将-i参数传递给varnishd，那么变量server.identity参数将被设置为由-n参数指定的的实例名称. 
  server.ip：表示接收客户端连接的socket里的ip地址. 
  server.port: 表示接收客户端连接的socket里的port. 
  req.request：表示请求的类型（例如，GET, HEAD）
  req.url：表示所请求的URL. 
  req.proto：表示客户端使用的HTTP协议的版本. 
  req.backend：表示要为请求提供服务所使用的后端服务器，它的值一般是声明backend时所用的名字. 
  req.backend.healthy：表示后端服务器是否健康可用. 要使用此变量，则需要在backend段的配置中，配置一个活动探测器. 
  req.http.header：表示各个相对应的HTTP头部变量，例如，req.http.host、req.http.Accept-Encoding等等. 只需将hearder换成对应的头部信息即可. 
  req.hash_always_miss：表示强制清除这个请求的缓存. 如果将它的值设置为true，则varnish将忽略已存在的任何缓存对象，直接从后端服务器来取数据. 
  req.hash_ignore_busy：表示忽略所有在缓存查找期间处于繁忙状态的对象. 如果你开启了两个varnish服务进程并且它们彼此之间都在相互查找数据，那么就可以通过设置此变量来避免可能出现的死锁现象. 
  req.can_gzip：表示客户端可以接收gzip传输编码. 
  req.restarts：表示请求被重新启动的次数. 
  req.esi：它的值是布尔值. 如果设置为false，那么将会禁用ESI处理而不管beresp.do_esi变量所这设置的值. 默认值是true，此值在以后的版本中会改变，因此应该避免使用此值. 
  req.esi_level：表示当前ESI请求所处的级别. 
  req.grace：表示设置启用grace的周期. 
  req.xid：表示请求的唯一ID. 


4.
以下变量是当varnish向后端服务器发送请求时可用，（要发送请求的情况有缓存丢失miss模式或pass模式或pipe模式）：
  bereq.request：表示请求的类型（例如，GET,HEAD）
  bereq.url：表示要请求的URL
  bereq.proto：表示varnish服务器所使用的HTTP协议的版本. 
  bereq.http.header：表示相应的HTTP头信息变量. 
  bereq.connect_timeout：表示和后端服务器连接所要等待的时间,单位是秒. 
  bereq.first_byte_timeout：表示后端服务器来的第一个字节到达varnish所要等待的时间，单位是秒. 此变量在pipe模式中不可用. 
  bereq.between_bytes_timeout：表示第一个字节到达后，等待之后的每个字节之间所要等待的时间，单位是秒. 


5.
以下的变量在所请求的对象从后端服务器接收以后，放入缓存之前可用. 也就是说，它们在内嵌子程序vcl_fetch中可用：
  beresp.do_stream：表示在没有把取回整个对象到varnish的情况下，就可以直接把已接收到的对象投递给客户端. 
  beresp.do_esi：它的值是布尔值. 表示在取回对象后，对此对象进行ESI处理. 默认值是false. 如果设置为true，则ESI指令会对对象进行解析. 不过只有req.esi设置为true时，它才有意义. 
  beresp.do_gzip：它的值是布尔值. 表示在存储对象之前先对其进行gzip压缩. 默认是false. 
  beresp.do_gunzip：它的值是布尔值. 表示在存储对象到缓存之前，先对其进行解压缩. 默认是值是false. 
  beresp.http.header：表示对应的响应的HTTP头信息. 
  beresp.proto：表示后端服务器响应时所使用的HTTP的协议版本. 
  beresp.status：表示被后端服务器所返回的HTTP状态码. 
  beresp.response：表示被后端服务器所返回的HTTP状态信息. 
  beresp.ttl：表示对象的存活时间，单位是秒，此变量是可写的. 
  beresp.grace：表示设置启用grace的周期. 
  beresp.saintmode：表示设置启用saint模式的周期. 
  beresp.backend.name：表示取回响应的后端服务器的主机名. 
  beresp.backend.ip：表示取回响应的后端服务器的IP地址. 
  beresp.backend.port：表示取回响应的后端服务器的端口号. 
  beresp.storage：表示强制varnish保存这个对象到一个特殊的存储后端服务器. 


6.
在对象进入缓存后，以下的变量（大多数是只读的）当对象已位于缓存的时候是可用的，通常用在内嵌函数vcl_hit中或者是当在vcl_error中构建synthetic回复时：
  obj.proto：表示当重新取回对象时所使用的HTTP协议的版本. 
  obj.status：表示被varnish服务器所返回的HTTP状态码. 
  obj.response：表示被varnish服务器所返回的HTTP状态信息. 
  obj.ttl：表示对象的存活时间，单位是秒，此变量是可写的. 
  obj.lastuse：表示自从上次请求以来，所过去的大概时间，单位是秒. 此变量在vcl_deliver中也是可用的. 
  obj.hits：表示对象已经被投递的大概次数. 它的值若为0，则表明缓存丢失了. 此变量在vcl_deliver中也是可用的. 
  obj.grace：表示对象的宽限时间，单位是秒. 此变量是可写的. 
  obj.http.header：表示对应的HTTP头部. 


7.
以下变量，在要判定对象hash键值时可用：
  req.hash：表示一个缓存中经常被使用的对象的hash值. 它可用在从缓存中读取或写入缓存中时. 


8.
以下变量，当在准备响应客户端时可用：
  resp.proto：表示响应所使用的HTTP协议版本. 
  resp.status：表示返回给客户端的HTTP状态码. 
  resp.response：表示返回给客户端的HTTP状态信息. 
  resp.http.header：表示对应的HTTP头信息. 
```

注意: <br>

在要给以上所有变量分配值的时候，使用set关键字，例如：

```
sub vcl_recv {
    if(req.http.host ~ "(?i)(www.)?example.com#") {
        set req.http.host = "www.example.com";
    }
}
```

HTTP的头部信息可以使用remove关键字来完全的删除，例如：<br>

```
sub vcl_fetch {
    remove beresp.http.Set-Cookie;
}
```

###12. Grace and saint mode

如果后端服务器生成一个对象需要很长时间的话，那么就会产生线程堆积的风险. 为了避免这种情况的发生，你可以启用grace.
它允许varnish在后端服务器在生成新对象的过程中，提供一个过期版本的对象.  <br>

以下的vcl代码将会让varnish提供一个过期的对象. 所有的对象在过期后或者新对象生成后，将会被保留两分钟： <br>

```
sub vcl_recv {
    set req.grace = 2m;
}

sub vcl_fetch {
    set beresp.grace = 2m;
}
```

saint模式类似于grace模式, 我们可以向vcl\_fetch中添加VCL代码来查看来自后端服务器的响应是否是你想要的.
如果你发现响应并不是你想要的，那么你可以通过beresp.saintmode变量设置一个时间期限并调用restart.
然后，varnish将会重新连接其他的后端服务器来尝试再取回想要的对象. 如果没有多台后端服务器或者restart的次数已经达到max\_restarts的设置值，
并且还存有一个比beresp.saintmode变量设置的时间还要新的对象，那么varnish将要提供这个对象，即使它比较陈旧. <br>


###13. EXAMPLES

1).
下面的example是默认的vcl方法, 如果我们自己没有重新定义,
那么会默认调用下面的方法. <br>

```
# 定义默认的backend, 注意修改你的host和port
backend default {
 .host = "backend.example.com";
 .port = "http";
}

#
sub vcl_recv {
    if (req.restarts == 0) {
        if (req.http.x-forwarded-for) {
            set req.http.X-Forwarded-For =
                req.http.X-Forwarded-For + ", " + client.ip;
        } else {
            set req.http.X-Forwarded-For = client.ip;
        }
    }
    # 非正确的方法
    if (req.request != "GET" &&
      req.request != "HEAD" &&
      req.request != "PUT" &&
      req.request != "POST" &&
      req.request != "TRACE" &&
      req.request != "OPTIONS" &&
      req.request != "DELETE") {
        /* Non-RFC2616 or CONNECT which is weird. */
        return (pipe);
    }
    # recv 默认仅仅处理GET和HEAD方法, 其他的需要交给pass模式
    if (req.request != "GET" && req.request != "HEAD") {
        /* We only deal with GET and HEAD by default */
        return (pass);
    }
    # 权限认证什么的直接给pass
    if (req.http.Authorization || req.http.Cookie) {
        /* Not cacheable by default */
        return (pass);
    }
    return (lookup);
}

#
sub vcl_pipe {
    # Note that only the first request to the backend will have
    # X-Forwarded-For set.  If you use X-Forwarded-For and want to
    # have it set for all requests, make sure to have:
    # set bereq.http.connection = "close";
    # here.  It is not set by default as it might break some broken web
    # applications, like IIS with NTLM authentication.
    return (pipe);
}

#
sub vcl_pass {
    return (pass);
}

#
sub vcl_hash {
    # 根据url得到hash值
    hash_data(req.url);
    # 两种不同的策略
    if (req.http.host) {
        hash_data(req.http.host);
    } else {
        hash_data(server.ip);
    }
    return (hash);
}

#
sub vcl_hit {
    return (deliver);
}

#
sub vcl_miss {
    return (fetch);
}

#
sub vcl_fetch {
    # hit到的值缓存2min
    if (beresp.ttl <= 0s ||
        beresp.http.Set-Cookie ||
        beresp.http.Vary == "*") {
                /*
                 * Mark as "Hit-For-Pass" for the next 2 minutes
                 */
                set beresp.ttl = 120 s;
                return (hit_for_pass);
    }
    return (deliver);
}

#
sub vcl_deliver {
    return (deliver);
}

#
sub vcl_error {
    set obj.http.Content-Type = "text/html; charset=utf-8";
    set obj.http.Retry-After = "5";
    synthetic {"
<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN"
 "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html>
  <head>
    <title>"} + obj.status + " " + obj.response + {"</title>
  </head>
  <body>
    <h1>Error "} + obj.status + " " + obj.response + {"</h1>
    <p>"} + obj.response + {"</p>
    <h3>Guru Meditation:</h3>
    <p>XID: "} + req.xid + {"</p>
    <hr>
    <p>Varnish cache server</p>
  </body>
</html>
"};
    return (deliver);
}

#
sub vcl_init {
        return (ok);
}

#
sub vcl_fini {
        return (ok);
}
```
<br>
2).
下面例子展示, 通过url选择不同的backend: <br>

```
backend www {
  .host = "www.example.com";
  .port = "80";
}

backend images {
  .host = "images.example.com";
  .port = "80";
}

sub vcl_recv {
  # 如果host是example.com结尾, 选择www服务器
  # 如果是images.example.com结尾, 选择images服务器
  # 否则: 报错
  if (req.http.host ~ "(?i)^(www.)?example.com$") {
    set req.http.host = "www.example.com";
    set req.backend = www;
  } elsif (req.http.host ~ "(?i)^images.example.com$") {
    set req.backend = images;
  } else {
    error 404 "Unknown virtual host";
  }
}
```

下面代码对所有的文档使用一个TTL: <br>

```
import std; # needed for std.log

sub vcl_fetch {
  if (beresp.ttl < 120s) {
    std.log("Adjusting TTL");
    set beresp.ttl = 120s;
  }
}
```

下面的代码示例，强制Varnish缓存文档，即使当cookie存在：<br>

```
sub vcl_recv {
  if (req.request == "GET" && req.http.cookie) {
     return(lookup);
  }
}

sub vcl_fetch {
  if (beresp.http.Set-Cookie) {
     return(deliver);
 }
}
```

下面代码实现了, 清除对象方法: <br>

```
acl purge {
  "localhost";
  "192.0.2.1"/24;
}

sub vcl_recv {
  if (req.request == "PURGE") {
    if (!client.ip ~ purge) {
      error 405 "Not allowed.";
    }
    return(lookup);
  }
}

sub vcl_hit {
  if (req.request == "PURGE") {
    purge;
    error 200 "Purged.";
  }
}

sub vcl_miss {
  if (req.request == "PURGE") {
    purge;
    error 200 "Purged.";
  }
}
```


###14. 参考

<a href="http://www.varnish-cache.org/docs/3.0/reference/vcl.html"  target="_blank">Varnish Configuration Language</a> <br>
<a href="http://bbs.linuxtone.org/home.php?mod=space&uid=18303&do=blog&id=3522"  target="_blank">Varnish之VCL——参考手册</a> <br>



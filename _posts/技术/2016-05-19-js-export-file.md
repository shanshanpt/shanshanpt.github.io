---
layout: post
title: js 导出文件
category: 技术
tags: js
keywords:
description:
---

### 1. Data格式

data数据类型有以下几种形式: <br>

> data:, \<文本数据\> <br>
> data:text/plain, \<文本数据\> <br>
> data:text/html, \<HTML代码\> <br>
> data:text/html;base64, \<base64编码的HTML代码\> <br>
> data:text/plain;charset=UTF-8;base64, \<base64编码的HTML代码\> <br>
> data:text/css, \<CSS代码\> <br>
> data:text/css;base64, \<base64编码的CSS代码\> <br>
> data:text/javascript, \<Javascript代码\> <br>
> data:text/javascript;base64, \<base64编码的Javascript代码\> <br>
> data:image/gif;base64, \<base64编码的gif图片数据\> <br>
> data:image/png;base64, \<base64编码的png图片数据\> <br>
> data:image/jpeg;base64, \<base64编码的jpeg图片数据\> <br>
> data:image/x-icon;base64, \<base64编码的icon图片数据\> <br>

###2. 导出文件

首先来例子导出文本文件, 例如text/csv文件:

```
var data = "AAAA\nBBBB\nCCCC\n";
// 为了在csv中换行,必须要进行编码
data = encodeURIComponent(data)
var uri = 'data:text/plain;charset=utf-8,' + data;
var downloadLink = document.createElement("a");
downloadLink.href = uri;
downloadLink.download = "屏蔽词.txt";
document.body.appendChild(downloadLink);
downloadLink.click();
document.body.removeChild(downloadLink);
```
如上, data是放在uri后面的, 注意导出的数据类型是text/plain, 并且使用utf-8进行编码, data直接接在uri后面, 这样
就可以导入到文件中. 注意\n如果不处理, 那么在文件中是无法被表现的, 所以需要使用encodeURIComponent来对data处理一下.
然后就能导出到文件了.<br>

如果数据中带中文问题的, 那么理论上导出是没有问题的, 因为使用的都是utf-8 编码, 不会乱码. 但是如果使用"微软"的软件如Excel打开, 会有问题,
但是用其他文本程序打开确是正常的, 原因就是少了一个 BOM头, BOM是微软的标准, 这就不多讲了. <br>

![1](/public/img/grocery/js/bom.png  "bom")<br>


###3. 参考<br>
<a href="http://blog.fk68.net/post/3783e_707fdf2" target="_blank">Web前端js导出csv文件使用a链接标签直拉下载文件保存数据文本换行符的URI不用base64编码</a>

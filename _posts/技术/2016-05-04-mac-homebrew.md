---
layout: post
title: Homebrew管理Formula多版本
category: 技术
tags: homebrew
keywords:
description:
---

Homebrew是mac下的软件包管理工具, 特别好用, 今天就来记录一下使用brew安装多个版本的软件过程.
<br>
拿安装go为例, 本机上之前安装了go1.4.2版本, 如果想要直接安装执行```brew instal go```, 那么一般是不会成功的, 会提示:

```
Error: go-1.4.2 already installed
To install this version, first `brew unlink go`
```

所以第一步是unlink已经安装的go, 执行```brew unlink go```.
<br>
然后使用```brew install go```安装就OK. 完成后, 机器上就有了1.4和1.6两个版本的go.

<br>
brew还提供了随意切换不同版本的的方式, 命令格式是: ```brew switch go version```, 例如如果想要切换到1.6版本,
那么执行```brew switch go 1.6```就OK.

<br>
感觉很好用有木有...好了, 不扯淡, 工作了...

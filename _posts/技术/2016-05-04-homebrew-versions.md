---
layout: post
title: Homebrew versions命令失效
category: 技术
tags: homebrew
keywords:
description:
---

Homebrew在以前有一个命令叫versions, 特别好用, 执行这个命令```brew versions go```就能看到所有的go版本, 然后选择我们需要的版本下载安装.
只是不知咋回事, 突然有一天, brew versions没法使用了, 提示错误: "Error: Unknown command: version". 好不爽有木有, (>_<)... 那怎么办呢?
我如果想要安装一些低版本的软件, 不好弄呀~  不过也是可以的, 只要找到低版本的go.rb文件放到Formula文件件, 然后安装就可以了.

<br>但是针对这个问题, 应该去怎么解决呢? 通过苦逼的搜索, 终于找到一种方法了.

<br>首先需要进入到brew的安装目录, 本机上是/usr/local/Library. 然后将所有的版本信息从git上clone下来, 执行```brew tap homebrew/homebrew-versions```,
此时所有的软件版本本地应该都能看到了. 例如本例中需要安装go版本, 那么执行```brew search go```, 就会显示所有的和go相关的版本.

```
homebrew/versions/go12
homebrew/versions/go13
homebrew/versions/go14
homebrew/versions/go15
...
```
然后就可以选择安装了~ 执行```brew install go15```.
<br>注意最后的最后还需要进行link和overwrite, 使用命令```brew link --overwrite go15```, 最后使用```go version```测试安装的版本是不是OK.


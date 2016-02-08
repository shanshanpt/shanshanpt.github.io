---
layout: post
title: 使用Jekyll搭建Github博客
category: 技术
tags: Jekyll
keywords:
description:
---

大年初一写一篇技术博客才是有纪念意义的^_^!<br>
作为一个前端文盲,搭建个博客也花费了不少时间.之前的博客在<a href="http://blog.csdn.net/shanshanpt">CSDN博客</a>上,
但是由于CSDN现在的广告做的太恶心了,实在受不了了,所以就先托管在Github上吧.本博客使用Jekyll搭建,所以记录一些相关的知识点.<br><br>

###0.Jekyll官网: <a href="http://jekyllrb.com/docs/home/">点我!</a><br>

###1.简单介绍
Jekyll是一个静态网站生成工具,使用它可以很方便的搭建一个静态博客.一般我们使用markdown来写博客,Jekyll可以将其转换成对应的页面.
首先我们需要安装Jekyll,可以使用Ruby中的gem来很方便的安装Jekyll,```bash gem install jekyll```.具体安装步骤见:
<a href="http://jekyllrb.com/docs/installation/">Jekyll安装</a><br>

###2.Jekyll目录结构
了解Jeykll的目录结构才能更好的进行Coding.
#####<1> _config.yml文件:
我们可以在这个文件中配置一些需要的参数变量,例如

```bash
author:
  name: X
  email: X@gmail.com
  csdn: http://blog.csdn.net/shanshanpt
title: shanshanpt
url: http://shanshanpt.github.io
```
我们想要获得配置文件中的变量可以直接使用\{\{site.title\}\}, \{\{site.author.name\}\}取到相应的值.<br>

#####<2> _includes目录
此目录一般会放置一些公用的文件,例如页面header.html文件,footer.html文件,这些文件在所有的页面中都是需要的,
相当于一个公共目录.我们需要使用这些文件的时候,直接将这些文件include到相应的文件中去就可以了.
例如_include中包含header.html和footer.html,我们在x.html文件中包含,代码如下:

```bash
<!doctype html>
<html>
<head>
  { % include header.html % }
</head>
<body>
  ...
  { % include footer.html % }
</body>
</html>
```
这样就可以将代码包含进去!<br>

#####<3> _layouts目录
上面说了_include相当于公共文件,_layouts相当于是不同的功能文件,例如我们常用post.html代表发布的文章的页面,或者page.html代表分页等.
我们生成博客的时候只需要取出相应的组件组合成博文就OK!在html文件中,我们可以指定html的父模板,当我们在父模板中使用\{\{content\}\}时候,
就可以将子模板的内容加载进来!

```bash
指定父模板
---
layout: base
---
引用内容
{ {content} }
```

#####<4> _post目录
我们将博客放在这个目录下,Jekyll可以读取相应的博客,并可以根据博客所属'分类','标签'等进行分类处理!

#####<5> _data文件
类似于_config文件,也是用于放置全局变量

#####<6> _site目录
Jekyll会将生成好的静态网页放到这个目录下,这个目录对于我们没什么用,可以忽略.

#####<7> CNAME
用于配置你自己的URL,例如配置了xxx.com,那么访问这个域名就可以重定向到gitgub所在的页面.

#####<8> index.html
博客首页文件


###3.全局节点以及相应字段介绍
Jekyll会给你一个指定的目录结构,同时根据目录结构生成相应的代码,所以这里有一些Jekyll已经生成的全局的变量可以使用,主要有:
>  site: 可以调用_config.yml中配置的全局变量信息,例如site.author.name<br>
>  page: 通过page可以获取页面的配置信息<br>
>  content: 父页面用于引入子页面节点的内容<br>
>  paginator: 分页信息<br>

<1> content是根据子页面节点的内容生成的,是用户定义的<br><br>
<2> _config.yml下我们可以配置很多变量,但是Jekyll会根据post文章情况统计一些很有意义的变量,如下:<br>

> site.time: 运行jekyll的时间<br>
> site.pages: 所有页面信息,具体信息字段下面会介绍<br>
> site.posts: 所有发布的文章信息<br>
> site.data: _data目录下的数据<br>
> site.documents: 所有的文档<br>
> site.categories: 所有的分类<br>
> site.tags: 所有的文章标签<br>
> site.related_posts: 类似文章,默认为10篇文章<br>
> site.static_files: 没有被jekyll处理的文章,有属性 path, modified_time 和 extname.<br>
> site.html_pages: 所有的html页面<br>
<br>

<3> page显示的是页面信息,主要字段如下
> page.content: 页面的内容<br>
> page.title 标题<br>
> page.excerpt: 摘要<br>
> page.url: 链接<br>
> page.date: 时间<br>
> page.id: 唯一标示<br>
> page.categories: 分类<br>
> page.tags: 标签<br>
> page.path: 源代码位置<br>
> page.next: 下一篇文章<br>
> page.previous: 上一篇文章<br>
<br>

<4> paginator记录的是分页信息
> paginator.per_page 每一页的数量<br>
> paginator.posts 这一页的数量<br>
> paginator.total_posts 所有文章的数量<br>
> paginator.total_pages 总的页数<br>
> paginator.page 当前页数<br>
> paginator.previous_page 上一页的页数<br>
> paginator.previous_page_path 上一页的路径<br>
> paginator.next_page 下一页的页数<br>
> paginator.next_page_path 下一页的路径<br>

上面的所有字段都可以在我们的html文件中直接调用,例如 \{\{ paginator.page \}\}代表当前页数!这样方便的了我们Coding.

了解了目录结构和一些隐藏的全局变量,我们的变成会变得很容易,至于具体的使用方法,可以去官网查看!




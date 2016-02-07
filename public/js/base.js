
/* 页面监听函数 */
$(document).ready(function() {
  /* 控制是否显示左侧导航栏 */
  $("#nav_btn").on('click', function() {
    isClicked = $(this).data('clicked');
    nav_click(isClicked);
    $(this).data('clicked', !isClicked);
  });
  /* 控制是否显示文章段落标题 */
  $("#content_btn").on('click', function(){
    isClicked = $(this).data('clicked');
    content_click(!isClicked);
    $(this).data('clicked',!isClicked);

  });

  $(document).pjax('.pjaxlink', '#pjax', { fragment: "#pjax", timeout: 10000 });
  /* 如果页面宽度<992,那么点击"隐藏/显示按钮" */
  $(document).on("pjax:end", function() {
    if($("body").find('.container').width() < 992)
      $('#nav_btn').click();
    $('.aside3').scrollTop(0);
    contentEffects();
  });

  /* 评论按钮被点击 */
  $('body').on('click', '.show-commend', function(){
    var ds_loaded = false;
    /* 获得当前用户name,注意评论是借助第三方进行的,所以下面会根据name
     * 到disqus.com中找到用户的评论,然后加载到页面中
     */
    window.disqus_shortname = $('.show-commend').attr('name');
    $.ajax({
      type: "GET",
      url: "http://" + disqus_shortname + ".disqus.com/embed.js",
      dataType: "script",
      cache: true
    });
  });

  contentEffects();
});

/* 控制左侧导航按钮动作 */
function nav_click(is_show) {
  if (is_show) {
    /* 显示左侧aside */
    $('.aside')
      .addClass('visible-md visible-lg')
      .removeClass('hidden-md hidden-lg')
    /* 调整右侧内容 */
    $('.aside3')
      .removeClass('col-md-13 col-lg-13')
      .addClass('col-md-13 col-lg-13');
    /* 调整文字内容格式 */
    $('.aside3-content')
      .removeClass('col-md-10 col-lg-8 col-md-offset-1 col-lg-offset-2')
      .addClass('col-md-13');
  } else {
    /* 隐藏左侧aside */
    $('.aside')
      .removeClass('visible-md visible-lg')
      .addClass('hidden-md hidden-lg');
    /* 右侧内容最大化 */
    $('.aside3')
      .removeClass('col-md-13 col-lg-13')
      .addClass('col-md-13 col-lg-13');
    /* 修改文字排版 */
    $('.aside3-content')
      .removeClass('col-md-13')
      .addClass('col-md-10 col-lg-8 col-md-offset-1 col-lg-offset-2'); 
  }  /*col-md-offset-1 col-lg-offset-2*/
}

/* 控制段落标题按钮显示与隐藏 */
function content_click(is_show){
  if (is_show) {
    $('#content_table').show();
    $('#content_btn i').removeClass('fa-plus').addClass('fa-minus');
  } else {
    $('#content_table').hide();
    $('#content_btn i').removeClass('fa-minus').addClass('fa-plus');
  }
}

function contentEffects(){
  //remove the asidebar
  $('.row-offcanvas').removeClass('active');
  if($("#nav").length > 0){
    $("#content > h2,#content > h3,#content > h4,#content > h5,#content > h6").each(function(i) {
        var current = $(this);
        current.attr("id", "title" + i);
        tag = current.prop('tagName').substr(-1);
        $("#nav").append("<div style='margin-left:"+15*(tag-1)+"px'><a id='link" + i + "' href='#title" +i + "'>" + current.html() + "</a></div>");
    }); 
    $("pre").addClass("prettyprint");
    prettyPrint(); 
    $('#content img').addClass('img-thumbnail').parent('p').addClass('center');
    $('#content_btn').show();
  }else{
    $('#content_btn').hide();
  }
}
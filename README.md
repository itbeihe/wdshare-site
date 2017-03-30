<p align="center"><a href="http://www.wdshare.org/" target="_blank"><img width="250" src="http://www.wdshare.org/static/skin2015/img/logo.png"></a></p>

## 介绍

wdshare-site 是西安前端交流会(wdshare)官网的源码，在线地址：http://www.wdshare.org/ ，主要包括活动，文章等模块，技术上后端使用了 node , express, mongodb 等技术。wdshare开发群QQ：149907893

## 安装部署

1. 安装 node , mongodb, imageMagick(用于会员上传头像、ueditor、验证码)
2. 启动 mongodb
3. 进入 wdshare-site 源码目录执行 `npm install` 安装所需依赖
4. 打开/server/config.js 配置数据库信息【db、dbUser、dbPass】
4. 执行 `npm start` 启动应用
5. 访问 `http://localhost:3000`
6. 后台管理 `http://127.0.0.1:3000/manage/`    
  
目前后台没有管理员账户，请使用下面命令添加管理员账户(admin/123456)
```
$ mongo 
$ > use wdshare  
$ > db.manage_users.save({username:'admin', password:'7c4a8d09ca3762af61e59520943dc26494f8941b'});
```

**注意** 

`ueditor-nodejs`需要稍微修改才能适用网站,修该地方如下：
```
\node_modules\ueditor-nodejs\ueditor.js
84行，修改为：'url': '/static' + urlRoot + '/' + file
123行，修改为：'url': '/static' + url
```
都是增加了 static 目录, ueditor-nodejs 中增加了 imageMagick 来压缩图片

## 贡献代码

wdshare-site 还处于不断的开发中，欢迎大家参与进来，提交bug、建议和贡献代码。

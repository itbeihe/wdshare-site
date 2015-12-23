var express = require('express'),
    fs = require('fs'),
    path = require('path'),
    sendMail = require("../server/sendMail.js"),
    router = express.Router(),
    init = require("../server/init.js"),
    authorize = init.authorize,
    goBack = init.goBack,
    crypto = require('crypto'),
    moment = require("moment"),
    config = require("../server/config"),
    URL = require('url');

/**
 * path:  /comment/get
 * 获取评论信息
 */
router.get('/get', function(req, res) {
    var id = req.query.id,
        model = req.query.model;
    commentModel.getSort({
        key: "Comment",
        body: {
            typeid: id,
            model:model
        },
        pages:{page:1, pagesize:1000},
        occupation: "addDate"// 排序字段
    }, function (err, data) {
        var _data = [],
            _item;
        if ( err ) {
            res.send({
                status: 200,
                code: 0,
                message: "读取内容错误！"
            });
            return false;
        }
        for ( var i=0; i<data.length; i++ ) {
            // 私密属性和隐藏属性的跳过
            if ( data[i].hide == true || data[i].privacy == true ) {
                continue;
            }
            _item = {};
            _item._id = data[i]._id;
            _item.userid = data[i].userid;
            _item.username = data[i].username;
            _item.title = data[i].title;
            _item.content = data[i].content;
            _item.quote = data[i].quote;
            _item.system = data[i].system;
            _item.zan = data[i].zan;
            _item.addDate = data[i].addDate;
            _item.nowDate = (new Date()).getTime();

            if ( req.session.user && data[i].userid == req.session.user._id ) {
                _item.master = true;
            }
            _data.push(_item);
        }

        // 替换 @谁 为链接后返回数据
        replaceUserLink(_data, function(newData) {
            res.send({
                status: 200,
                code: 1,
                data: newData
            });
        });

        return false;
    });
    
    // 替换 @谁 为链接
    function replaceUserLink(data, callback) {
        var c = 0;
        for ( var i=0,l=data.length; i<l; i++ ) {
            (function(i) {
                if ( data[i].content.indexOf("@") < 0 ) {
                    c++;
                    go();
                } else {
                    var usernameList = data[i].content.match(/@\S+/g);
                    nameToID(usernameList, function(ids) {
                        for ( var j=0,le=usernameList.length; j<le; j++ ) {
                            if ( ids[usernameList[j]] ) {
                                data[i].content = data[i].content.replace(usernameList[j], '<a href="/user/'+ids[usernameList[j]]+'" target="_blank">'+usernameList[j]+'</a>');
                            }
                        }
                        c++;
                        go();
                    });
                }
            })(i);
        }

        function go() {
            if ( c == data.length && callback ) {
                callback(data);
            }
        };
    };

    // 会员昵称转ID
    function nameToID(items, callback) {
        var ids = {},
            c = 0;
        for ( var i=0,l=items.length; i<l; i++ ) {
            usersModel.getOne({
                key: "User",
                body: {
                    username: items[i].replace("@", "")
                }
            }, function (err, user) {
                if (err) {
                    c++;
                    go();
                    return false;
                }
                if ( user && user.username ) {
                    ids["@"+user.username] = user._id;
                    c++;
                    go();
                    return false;
                }
                c++;
                go();
                return false;
            });
        }
        function go() {
            if ( c == items.length && callback ) {
                callback(ids);
            }
        }
    };
});


/**
 * path:  /comment/add
 * 添加评论信息
 */
router.post('/add', function(req, res) {
    var code = req.body.code;

    // 判断系统环境
    var ua = req.headers['user-agent'],
        system = {},
        _system = "";

    if (/mobile/i.test(ua))
        system.Mobile = true;

    if (/like Mac OS X/.test(ua)) {
        system.iOS = /CPU( iPhone)? OS ([0-9\._]+) like Mac OS X/.exec(ua)[2].replace(/_/g, '.');
        system.iPhone = /iPhone/.test(ua);
        system.iPad = /iPad/.test(ua);
    }

    if (/Android/.test(ua))
        system.Android = /Android ([0-9\.]+)[\);]/.exec(ua)[1];
    if (/webOS\//.test(ua))
        system.webOS = /webOS\/([0-9\.]+)[\);]/.exec(ua)[1];
    if (/(Intel|PPC) Mac OS X/.test(ua))
        system.Mac = /(Intel|PPC) Mac OS X ?([0-9\._]*)[\)\;]/.exec(ua)[2].replace(/_/g, '.') || true;
    if (/Windows NT/.test(ua))
        system.Windows = /Windows NT ([0-9\._]+)[\);]/.exec(ua)[1];
    
    if ( system.webOS ) {
        _system = "webOS";
    }
    if ( system.Mac ) {
        _system = "Mac";
    }
    if ( system.Windows ) {
        _system = "Windows";
    }
    if ( system.Mobile ) {
        if ( system.Android ) {
            _system = "Android";
        }
        if ( system.iPhone ) {
            _system = "iPhone";
        }
        if ( system.iPad ) {
            _system = "iPad";
        }
    }


    if (!req.session.user) {
        res.send({
            status: 200,
            code: 0,
            message: "请登录后评论！"
        });
        return false;
    }
    // 未激活用户不允许进入
    if (!req.session.user.isActive) {
        res.send({
            status: 200,
            code: 0,
            message: "您的账号未激活，请先激活账号！",
            url:"/user/activeAccount"
        });
        return false;
    }

    // 判断config配置是否允许评论【全站行为】
    if (!config.isComment) {
        res.send({
            status: 200,
            code: 0,
            message: "评论功能已关闭！"
        });
        return false;
    }


    // 验证码错误
    if ( req.session.addCommentIsShowCaptcha >= config.isShowCaptcha ) {//需要检查验证码的正确性
        if ( !code ) {
            res.send({
                status: 200,
                code: 0,
                message: "请输入验证码！",
                reload: true
            });
            return false;
        }
        if ( !req.session.captcha ) {
            res.send({
                status: 200,
                code: 0,
                message: "系统出现异常，请稍后再试！"
            });
            return false;
        }
        if (code.toUpperCase() != req.session.captcha.toUpperCase() ) {
            res.send({
                status: 200,
                code: 0,
                message: "验证码错误，请重试！"
            });
            return false;
        }
    }

    // 记录该用户评论的次数
    if ( req.session.addCommentIsShowCaptcha ) {
        req.session.addCommentIsShowCaptcha++;
    } else {
        req.session.addCommentIsShowCaptcha = 1;
    }


    action();


    function action() {
        var typeid = req.body.typeid,
            model = req.body.model,
            title = req.body.title,
            privacy = req.body.privacy,
            quote = req.body.quote || "",
            content = req.body.content;

        if ( content.length > config.commentMax ) {
            res.send({
                status: 200,
                code: 0,
                message: "内容超出最大限制，请锁定在"+config.commentMax+"字以内！"
            });
            return false;
        }

        // 请求数据，为了获取该条数据是否允许评论
        if ( model == "article" || model == "project" || model == "job" ) {
            archiveModel.getOne({
                key: "Archive",
                body: {
                    _id: typeid
                }
            }, function (err, data) {
                if ( err ) {
                    res.send({
                        status: 200,
                        code: 0,
                        message: "查询匹配内容出错！"
                    });
                    return false;
                }
                
                if (data && data.type) {
                    // 先查询评论内容是否有，如果有则查看时间是否过于频繁，与config对比
                    // 先确定该会员是否有评论，因为没有评论时获取最新评论会出错
                    commentModel.getOne({
                        key: "Comment",
                        body: {
                            userid: req.session.user._id
                        }
                    }, function (err, comment) {
                        if ( comment && comment.username ) {
                            commentModel.getSort({
                                key: "Comment",
                                body: {
                                    userid: req.session.user._id
                                },
                                pages:{},
                                occupation: "addDate"// 排序字段
                            }, function (err, comment) {
                                if ( (new Date()).getTime() - comment[0].addDate < config.commentDuration * 1000 * 60 ) {// 过于频繁的评论
                                    res.send({
                                        status: 200,
                                        code: 0,
                                        message: "操作太频繁了，"+ config.commentDuration +"分钟后再试！"
                                    });
                                } else {
                                    save(data);
                                };
                                return false;
                            });
                            return false;
                        }
                        save(data);
                        return false;
                    });
                    return false;
                }

                res.send({
                    status: 200,
                    code: 0,
                    message: "未知错误！"
                });
            });

            function save(data) {
                // 档案是否允许评论
                if ( !data.isComment ) {
                    res.send({
                        status: 200,
                        code: 0,
                        message: "本条信息禁止了评论功能！"
                    });
                    return false;
                }

                // 昵称不合法
                if (req.session.user.username.indexOf("@") > -1) {
                    res.send({
                        status: 200,
                        code: 0,
                        message: "昵称不合法，请进行调整！",
                        url:"/user/editInfo"
                    });
                    return false;
                }

                // 通过验证请求时清空验证码session
                req.session.captcha = null;


                // 开始汇总计算需要发送邮件里表
                var archive_userid = data.userId;

                // 保存评论
                commentModel.save({
                    key: "Comment",
                    body: {
                        typeid: typeid,
                        model: model,
                        userid: req.session.user._id,
                        email: req.session.user.email,
                        username: req.session.user.username,
                        title: title,
                        content: content,
                        privacy: privacy,
                        quote: quote,
                        ip: req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                        city: "",// 预留字段，暂时没有解决方案
                        addDate: (new Date()).getTime(),
                        hide: false,
                        zan: 0,
                        system: _system
                    }
                }, function (err, data) {
                    if (err) {
                        res.send({
                            status: 200,
                            code: 0,
                            message: "保存信息出错，请重试！"
                        });
                        return false;
                    }

                    res.send({
                        status: 200,
                        code: 1,
                        message: "评论发布成功！",
                        data: {
                            userid: req.session.user._id,
                            username: req.session.user.username,
                            content: content,
                            quote: quote
                        }
                    });
                    commentSendMail(archive_userid, quote, content, data._id);
                    return false;
                });
            };
            
            // 评论成功后发送邮件
            function commentSendMail(archive_userid, quote, content, id) {
                var userList = [];
                userList.push(archive_userid);
                if ( quote ) {
                    commentModel.getOne({
                        key: "Comment",
                        body: {
                            _id: quote
                        }
                    }, function (err, comment) {
                        if (err) {
                            res.send({
                                status: 200,
                                code: 0,
                                message: "服务器错误，请重试！"
                            });
                            return false;
                        }
                        if ( comment && comment.userid ) {
                            userList.push(comment.userid);
                            checkContent(comment);
                            return false;
                        }
                        res.send({
                            status: 200,
                            code: 0,
                            message: "未知错误，请重试！"
                        });
                        return false;
                    });
                } else {
                    checkContent();
                }

                // 检查内容中有没有@谁
                function checkContent(quote) {
                    if ( content.indexOf("@") < 0 ) {// 不包含
                        send(quote);
                    } else {
                        usernameList = content.match(/@\S+/g);
                        
                        nameToID(usernameList, function(data) {
                            userList = userList.concat(data);
                            send(quote);
                        });
                    }
                };

                // 发送邮件
                function send(quote) {
                    var items = changeRepeat(userList);
                    idToMail(items, function(mails) {
                        var c = 0,
                            str,
                            notice = '';
                        for ( var i=0,l=mails.length; i<l; i++ ) {
                            (function(i) {
                                if ( mails[i] == req.session.user.email ) {// 列表中存在自己时跳过
                                    c++;
                                    go();
                                    return;
                                } else {
                                    if ( quote ) {
                                        str = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; " + req.session.user.username +" 对 《"+ title + "》发表评论：<br />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; " + content + "<br /><br /><br />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 以上内容是对该评论的回复：<br />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; " + quote.username +" 说："+ quote.content;
                                    } else {
                                        str = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; " + req.session.user.username +" 对 《"+ title + "》发表评论：<br />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; " + content;
                                    }
                                    str += '<br /><br />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 内容链接：<a href="' + config.url + "/" + model + "/" + typeid + '">' + config.url + "/" + model + "/" + typeid + '</a>';
                                    sendMail({
                                        from: config.mail.sendMail,
                                        to: mails[i],
                                        subject: '《'+ title + '》有新的评论',
                                        html: '亲爱的：<br /><br /> '+ str + config.mailSignature
                                    }, function() {// succeed
                                        notice += '{"mail":"'+mails[i]+'","state":"success"},';
                                        c++;
                                        go();
                                    }, function() {// error
                                        notice += '{"mail":"'+mails[i]+'","state":"error"},';
                                        c++;
                                        go();
                                    });
                                }
                            })(i);
                        }

                        function go() {
                            if ( c == mails.length ) {
                                if ( notice ) {
                                    notice = '[' + notice.substring(0, notice.length-1) + ']';
                                } else {
                                    notice = '[]';
                                }
                               commentModel.update({
                                    _id: id
                                }, {
                                    key: "Comment",
                                    body: {
                                        notice: notice
                                    }
                                }, function (err, data) {}); 
                            }
                        };
                        
                    });
                };

                // 会员昵称转ID，方便统一处理mail转化
                function nameToID(items, callback) {
                    var c = 0,
                        ids = [];
                    for ( var i=0,l=items.length; i<l; i++ ) {
                        usersModel.getOne({
                            key: "User",
                            body: {
                                username: items[i].replace("@", "")
                            }
                        }, function (err, user) {
                            if (err) {
                                c++;
                                go();
                                return false;
                            }
                            if ( user && user.username ) {
                                c++;
                                ids.push(user._id);
                                go();
                                return false;
                            }
                            c++;
                            go();
                            return false;
                        });
                    }
                    function go() {
                        if ( c == items.length && callback ) {
                            callback(ids);
                        }
                    }
                };
                // 会员ID转mail
                function idToMail(items, callback) {
                    var c = 0,
                        ids = [];
                    for ( var i=0,l=items.length; i<l; i++ ) {
                        usersModel.getOne({
                            key: "User",
                            body: {
                                _id: items[i]
                            }
                        }, function (err, user) {
                            if (err) {
                                c++;
                                go();
                                return false;
                            }
                            if ( user && user.username ) {
                                c++;
                                ids.push(user.email);
                                go();
                                return false;
                            }
                            c++;
                            go();
                            return false;
                        });
                    }
                    function go() {
                        if ( c == items.length && callback ) {
                            callback(ids);
                        }
                    }
                };

                /**
                 * 数组排重
                 * @param  {Array}   items    要排重的数组
                 * @return {Array}            排重后的数组
                 */
                function changeRepeat(items) {
                    var o = {},
                        _a = [];
                    for ( var i=0,l=items.length; i<l; i++ ) {
                        o[items[i]] = 1;
                    }
                    for ( key in o ) {
                        _a.push(key);
                    }
                    return _a;
                };
            };
        }

        if ( model == "active" ) {

        }

        if ( model == "message" ) {// 会员留言必须开启

        }

        
    };
});

/**
 * path:  /comment/del/:id
 * 删除评论
 */
router.get('/del/:id', function(req, res) {
    var id = req.params.id;

    if (!req.session.user) {
        res.send({
            status: 200,
            code: 0,
            message: "未登录！"
        });
        return false;
    }

    // 先查询，检查条件是否满足
    commentModel.getOne({
        key: "Comment",
        body: {
            _id: id
        }
    }, function (err, data) {
        if ( err ) {
            res.send({
                status: 200,
                code: 0,
                message: "服务器错误，请重试！"
            });
            return false;
        }

        if ( data && data.userid ) {
            if ( data.userid !== req.session.user._id ) {
                res.send({
                    status: 200,
                    code: 0,
                    message: "权限不足！"
                });
            } else {
                remove();
            }
            return;
        }

        res.send({
            status: 200,
            code: 0,
            message: "未知错误，请重试！"
        });
    });

    // 移除评论
    function remove() {
        commentModel.remove({
            key: "Comment",
            body: {
                _id: id
            }
        }, function (err, data) {
            if (err) {
                res.send({
                    status: 200,
                    code: 0,
                    message: "服务器错误，请重试！"
                });
                return;
            }

            if (data) {
                res.send({
                    status: 200,
                    code: 1,
                    message: "删除成功！"
                });
                return;
            }

            res.send({
                status: 200,
                code: 0,
                message: "未知错误，请重试！"
            });
        });
    };
});

/**
 * path:  /comment/setzan/:id
 * 评论点赞
 */
router.get('/setzan/:id', function(req, res) {
    var id = req.params.id,
        referer = req.headers['referer'];

    // 利用referer来检测是不是恶意点赞【临时】
    if ( !referer ) {
        res.send("哥！别闹，服务器太差，经不起您折腾");
        return false;
    }
    commentModel.getOne({// 查询当前赞
        key: "Comment",
        body: {
            _id: id
        }
    }, function (err, data) {
        if (err) {
            res.send({
                status: 200,
                code: 0,
                message: "服务器错误，请重试！"
            });
            return;
        }

        if (data) {
            // 增加评论点赞
            var newzan = parseInt(data.zan) + 1;
            commentModel.update({
                    _id: id
                }, {
                key: "Comment",
                body: {
                    zan: newzan
                }
            }, function (err, __data) {
                if (err) {
                    res.send({
                        status: 200,
                        code: 0,
                        message: "服务器错误，请重试！"
                    });
                    return;
                }

                res.send({
                    status: 200,
                    code: 1,
                    message: "点赞成功！"
                });
                
            });
            return;
        }

        res.send({
            status: 200,
            code: 0,
            message: "未知错误，请重试！"
        });
    });
});



module.exports = router;

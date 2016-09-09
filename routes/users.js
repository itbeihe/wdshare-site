var express = require('express'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    sendMail = require("../server/sendMail.js"),
    router = express.Router(),
    init = require("../server/init.js"),
    authorize = init.authorize,
    goBack = init.goBack,
    crypto = require('crypto'),
    moment = require("moment"),
    config = require("../server/config"),
    URL = require('url'),
    Busboy = require('busboy'),
    fse = require('fs-extra'),
    gm = require('gm'),
    imageMagick = gm.subClass({ imageMagick : true });


/**
 * 用户中心相关
 */

// 用户中心首页
router.route('/').get(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
        return false;
    }

    // 跳转至用户中心页面
    res.redirect("/user/"+req.session.user._id);
});

// 全部会员列表
router.route('/all').get(function (req, res) {
    "use strict";
    var urlParams = URL.parse(req.originalUrl, true).query,
        page = urlParams.page || 1,
        pagesize = urlParams.pagesize || 20,
        pathname = URL.parse(req.originalUrl, true).pathname;
    getUsersList (req, res, {isActive:true, lock:false}, {page:page, pagesize:pagesize, pathname:pathname}, 'users/all');
});
/**
 * 获取会员列表内容
 * @param  {Object} o 限制条件
 * @param  {Object} pages 分页参数对象
 * @param  {String} mod 模板路径
 * @param  {String} channelName 分类名称
 * @return
 */
function getUsersList(req, res, o, pages, mod) {
    usersModel.getSort({
        key: "User",
        body:o,// 筛选内容
        pages: pages,// 分页信息
        occupation: "regTime"// 排序字段
    }, function (err, data) {
        var articleCount = 0,
            userInfoCount = 0,
            allCount;
        if (err) {
            res.send("服务器错误，请重试！");
            return;
        }

        if (data) {
            for ( var i=0; i<data.length; i++ ) {
                (function(i) {
                    // 获取文章数
                    archiveModel.getAll({
                        key: "Archive",
                        body: {
                            userId: data[i]._id,
                            audit: true
                        }
                    }, function (err, article) {
                        if (err) {
                            res.send("服务器错误，请重试！");
                            return;
                        }

                        if (article) {
                            data[i].article = article.length;
                            articleCount++
                            gosend();
                            return;
                        }
                        res.send("未知错误，请重试！");
                    });

                    // 获取用户详细信息
                    usersInfosModel.getOne({
                        key: "User_info",
                        body: {
                            userid: data[i]._id
                        }
                    }, function (err, userInfo) {
                        if (err) {
                            res.send("服务器错误，请重试！");
                            return;
                        }
                        
                        data[i].userInfo = userInfo || {};
                        userInfoCount++;
                        gosend();
                        return;
                    });
                })(i);
            }

            // 获取总数
            usersModel.getAll({
                key: "User",
                body: o
            }, function (err, data) {
                if (err) {
                    res.send("服务器错误，请重试！");
                    return;
                }

                if (data) {
                    allCount = data.length;
                    gosend();
                    return;
                }

                res.send("未知错误，请重试！");
            });

            return;
        }

        res.send("未知错误，请重试！");

        // 所有数据都获取完成后执行返回
        function gosend() {
           var _page = pages;
           if ( articleCount == data.length && userInfoCount == data.length && allCount >= 0 ) {
                _page.sum = allCount;
                res.render(mod, {
                    title: "全部会员",
                    result: data,
                    pages:_page
                });
           }
        };
    });
};

// 获取用户信息接口
router.route('/get').get(function (req, res) {
    if (!req.session.user) {
        res.send({
            status: 200,
            code: 0,
            member: {},
            info:{}
        });
        return false;
    }

    var id = req.session.user._id,
        userdata;

    // 先查users表的用户信息
    usersModel.getOne({
        key: "User",
        body: {
            _id: id
        }
    }, function (err, data) {
        if ( !data ) {
            res.send({
                status: 200,
                code: 0,
                member: {},
                info:{}
            });
            return false; 
        } else {
            userdata = {
                username: data.username,
                isActive: data.isActive
            };
        }
        // 再查info
        usersInfosModel.getOne({
            key: "User_info",
            body: {
                userid: id
            }
        }, function (err, info) {
            if (err || !info) {// 会员信息不存在
                res.send({
                    status: 200,
                    code: 0,
                    member: userdata,
                    info:{}
                });
            } else {// 已存在
                res.send({
                    status: 200,
                    code: 1,
                    member: userdata,
                    info: {
                        sex: info.sex,
                        realname: info.realname,
                        jobstate: info.jobstate,
                        com: info.com,
                        jobs: info.jobs,
                        school: info.school,
                        isPartTime: info.isPartTime,
                        www: info.www,
                        qq: info.qq,
                        wechat: info.wechat,
                        weibo: info.weibo,
                        github: info.github,
                        phone: info.phone,
                        zan: info.zan,
                        offer: info.offer,
                        mood: info.mood,
                        tag: info.tag,
                        introduction: info.introduction
                    }
                });
            }
        });
    });
});

// 编辑用户资料  user_infos表操作
router.route('/editInfo').get(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
        return false;
    }
    var id = req.session.user._id;

    var userdata = {};

    // 先查users表的用户信息
    usersModel.getOne({
        key: "User",
        body: {
            _id: id
        }
    }, function (err, data) {
        if (data) {
            userdata = data;
        }
        if ( !data.isActive ) {
            res.redirect("/user/activeAccount/");
            return false; 
        }
        // 再查info
        usersInfosModel.getOne({
            key: "User_info",
            body: {
                userid: id
            }
        }, function (err, data) {
            if (err || !data) {// 会员信息不存在
                res.render('users/user_info', {
                    title: "修改信息",
                    info: {},
                    member: userdata
                });
            } else {// 已存在
                res.render("users/user_info", {
                    title: '修改信息',
                    info: data,
                    member: userdata
                });
            }
        });
    });
    
}).post(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.send({
            status: 200,
            code: 0,
            message: "未登录！"
        });
        return false;
    }

    var mood = req.body.mood || "",
        sex = parseInt(req.body.sex),
        realname = req.body.realname || "",
        tag = req.body.tag || "",
        jobstate = parseInt(req.body.jobstate),
        com = req.body.com || "",
        jobs = req.body.jobs || "",
        school = req.body.school || "",
        isPartTime = req.body.isPartTime == "2" ? false : true,
        phone = req.body.phone || "",
        qq = req.body.qq || "",
        wechat = req.body.wechat || "",
        www = req.body.www || "",
        weibo = req.body.weibo || "",
        github = req.body.github || "",
        introduction = req.body.introduction || "";
        // realname = req.body.realname,
        // tag = req.body.tag,
        // jobstate = parseInt(req.body.jobstate),
        // com = req.body.com,
        // jobs = req.body.jobs,
        // school = req.body.school,
        // isPartTime = req.body.isPartTime == "2" ? false : true,
        // phone = req.body.phone,
        // qq = req.body.qq,
        // wechat = req.body.wechat,
        // www = req.body.www,
        // weibo = req.body.weibo,
        // github = req.body.github,
        // introduction = req.body.introduction;

        // 限制字符串长度
        mood = mood.substring(0,200);
        realname = realname.substring(0,10);
        tag = tag.substring(0,50);
        com = com.substring(0,32);
        jobs = jobs.substring(0,32);
        school = school.substring(0,32);
        phone = phone.substring(0,11);
        qq = qq.substring(0,32);
        wechat = wechat.substring(0,32);
        www = www.substring(0,64);
        weibo = weibo.substring(0,64);
        github = github.substring(0,64);
        introduction = introduction.substring(0,1000);

    var user_error_msg,
        info_error_msg,
        user_flag,
        info_flag;

    var tagArray = tag.split(",");
    if ( tagArray.length > 6 ) {
        res.send({
            status: 200,
            code: 0,
            message: "标签个数不能大于6个"
        });
        return false;
    }

    if ( tagArray.length > 0 ) {
        var tagMaxFontCount = false;
        for ( var i=0,l=tagArray.length; i<l; i++ ) {
            if ( tagArray[i].length > 15 ) {
                tagMaxFontCount = true;
            }
        }
        if ( tagMaxFontCount ) {
            res.send({
                status: 200,
                code: 0,
                message: "单个标签字数不能大于15"
            });
            return false;
        }
    }

    // 检测非法字符
    var nullFlag = false;
    var nullWordsNickname = config.nullWordsNickname;
    var nullWordsCommon = config.nullWordsCommon;
    // 昵称检测
    for ( var i=0,l=nullWordsNickname.length; i<l; i++ ) {
        if ( req.body.nickname.indexOf(nullWordsNickname[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "昵称中含有非法字符！"
        });
        return false;
    }
    // 签名检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( mood.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "签名中含有非法字符！"
        });
        return false;
    }
    // 真实姓名检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( realname.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "真实姓名中含有非法字符！"
        });
        return false;
    }
    // 技能标签检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( tag.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "技能标签中含有非法字符！"
        });
        return false;
    }
    // 公司名称检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( com.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "公司名称中含有非法字符！"
        });
        return false;
    }
    // 职位名称检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( jobs.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "职位名称中含有非法字符！"
        });
        return false;
    }
    // 学校名称检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( school.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "学校名称中含有非法字符！"
        });
        return false;
    }
    // QQ号检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( qq.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "QQ号中含有非法字符！"
        });
        return false;
    }
    // 微信号检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( wechat.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "微信号中含有非法字符！"
        });
        return false;
    }
    // 个人网站检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( www.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "个人网站中含有非法字符！"
        });
        return false;
    }
    // 微博地址检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( weibo.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "微博地址中含有非法字符！"
        });
        return false;
    }
    // Github检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( github.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "Github中含有非法字符！"
        });
        return false;
    }
    // 个人介绍检测
    for ( var i=0,l=nullWordsCommon.length; i<l; i++ ) {
        if ( introduction.indexOf(nullWordsCommon[i]) >= 0 ) {
            nullFlag = true;
        }
    }
    if ( nullFlag ) {
        res.send({
            status: 200,
            code: 0,
            message: "个人介绍中含有非法字符！"
        });
        return false;
    }



    // 检测是否有http://
    if ( www.indexOf("http://") < 0 && www.indexOf("https://") < 0 ) {
        www = "http://" + www;
    }
    if ( weibo.indexOf("http://") < 0 && weibo.indexOf("https://") < 0 ) {
        weibo = "http://" + weibo;
    }
    if ( github.indexOf("http://") < 0 && github.indexOf("https://") < 0 ) {
        github = "http://" + github;
    }

    // tag内容进行优化
    // 避免两个重复的逗号
    tag = tag.replace(/,,/g, ",");
    // 最后一个字符为逗号时清除掉
    if ( tag.lastIndexOf(",") == tag.length-1 ) {
        tag = tag.substring(0, tag.lastIndexOf(","));
    }


    var id = req.session.user._id;


    // 写入users表的用户昵称
    if ( req.body.nickname ) {
        var nickname = req.body.nickname;
        nickname = nickname.substring(0,16);
        usersModel.getOne({
            key: "User",
            body: {
                username: nickname
            }
        }, function (err, data) {
            if ( err ) {
                user_flag = false;
                pageSend();
                return false;
            }
            
            if (data == null) {

                // 更新session［放在这里第一次更新才能生效，正常保存不会有风险，除非下面这个保存失败才有风险］
                req.session.user.username = nickname;
                
                usersModel.update({
                    _id: id
                }, {
                    key: "User",
                    body: {
                        username: nickname
                    }
                }, function (err, data) {
                    if (err) {
                        user_flag = false;
                        user_error_msg = "昵称保存错误！";
                        pageSend();
                    } else {
                        user_flag = true;
                        pageSend();
                    }
                });
            } else {
                user_flag = false;
                user_error_msg = "昵称已被占用，请换一个试试！";
                pageSend();
            }
        });
    } else {
        user_flag = true;
        pageSend();
    }
    

    // 写入user_infos表的用户信息
    usersInfosModel.getOne({
        key: "User_info",
        body: {
            userid: id
        }
    }, function (err, data) {
        if (err || !data) {// 会员信息不存在
            usersInfosModel.save({
                key: "User_info",
                body: {
                    email: req.session.user.email,
                    userid: id,
                    mood: mood,
                    sex: sex,
                    realname: realname,
                    tag: tag,
                    jobstate: jobstate,
                    com: com,
                    jobs: jobs,
                    school: school,
                    isPartTime: isPartTime,
                    phone: phone,
                    qq: qq,
                    wechat: wechat,
                    www: www,
                    weibo: weibo,
                    github: github,
                    zan: 0,
                    offer: 0,
                    introduction: introduction,
                    updataTime: (new Date()).getTime(),
                    updataIp: req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress
                }
            }, function (err, data) {
                if (err) {
                    info_flag = false;
                    info_error_msg = "添加失败，请稍后重试！";
                    pageSend();
                } else {
                    info_flag = true;
                    pageSend();
                }
            });
        } else {// 已存在
            usersInfosModel.update({
                userid: id
            }, {
                key: "User_info",
                body: {
                    userid: id,
                    mood: mood,
                    sex: sex,
                    realname: realname,
                    tag: tag,
                    jobstate: jobstate,
                    com: com,
                    jobs: jobs,
                    school: school,
                    isPartTime: isPartTime,
                    phone: phone,
                    qq: qq,
                    wechat: wechat,
                    www: www,
                    weibo: weibo,
                    github: github,
                    introduction: introduction,
                    updataTime: (new Date()).getTime(),
                    updataIp: req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress
                }
            }, function (err, data) {
                if (err) {
                    info_flag = false;
                    info_error_msg = "修改失败，请稍后重试！";
                    pageSend();
                } else {
                    info_flag = true;
                    pageSend();
                }
            });
        }
    });


    function pageSend() {
        if ( user_flag === undefined || info_flag === undefined ) {
            return false;
        }
        var msg = '';
        if ( user_error_msg ) {
            msg += user_error_msg;
        }
        if ( info_error_msg ) {
            msg += info_error_msg;
        }

        if ( user_flag && info_flag ) {
            res.send({
                status: 200,
                code: 1,
                message: "信息提交成功！"
            });
            tagsCheck(tag);
        } else {
            res.send({
                status: 200,
                code: 0,
                message: msg
            });
        }
    };
    
    // 对标签进行检查，存在的增加计数，不存在的添加
    function tagsCheck(tags) {
        var tags = tags.split(",");
        for ( var i=0,l=tags.length; i<l; i++ ) {
            (function(i) {
                var count;
                // 获取翻个标签，检查是否存在
                tagModel.getOne({
                    key: "Tag",
                    body: {
                        name: tags[i],
                        model: "member"
                    }
                }, function (err, data) {
                    if (err) {
                        res.send("服务器错误，请重试！");
                        return;
                    }
                    
                    if ( data && data.name ) {// 存在
                        count = data.level + 1;
                        tagModel.update({
                            name: data.name,
                            model: "member"
                        }, {
                            key: "Tag",
                            body: {
                                level: count,
                                editDate: (new Date()).getTime()
                            }
                        }, function (err, data) {});
                    } else {// 不存在
                        if ( !tags[i] ) {
                            return;
                        }
                        count = 1;
                        tagModel.save({
                            key: "Tag",
                            body: {
                                name: tags[i],
                                level: count,
                                model: "member",
                                addDate: (new Date()).getTime(),
                                editDate: (new Date()).getTime()
                            }
                        }, function (err, data) {});
                    }
                    return;
                });
            })(i);
        }
    };
});


// 修改密码
router.route("/editPassword").get(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
        return false;
    }

    var id = req.session.user._id;

    // 先查users表的用户信息
    usersModel.getOne({
        key: "User",
        body: {
            _id: id
        }
    }, function (err, user) {
        // 再查info
        usersInfosModel.getOne({
            key: "User_info",
            body: {
                userid: id
            }
        }, function (err, info) {
            if (err || !info) {
                res.render('users/empty', {title:'修改密码提示', content:'先完善信息后才有权限修改密码。<br /><a href="/user/editInfo">点击完善信息</a>'});
            }
            res.render('users/editPassword', {
                member: user,
                info: info
            });
        });
    });
}).post(function (req, res) {
    "use strict";
    var password = req.body.password,
        newPassword = req.body.newPassword,
        reNewPassword = req.body.reNewPassword,
        passwordHash = crypto.createHash("sha1").update(new Buffer(password, "binary")).digest('hex'),
        NewPasswordHash = crypto.createHash("sha1").update(new Buffer(newPassword, "binary")).digest('hex'),
        user = req.session.user.email;

    if (newPassword.length < 6) {
        res.send({
            status: 200,
            code: 0,
            message: "新密码太短了，至少大于6位！"
        });
        return;
    }
    if (newPassword === password) {
        res.send({
            status: 200,
            code: 0,
            message: "新密码与旧密码不能一样！"
        });
        return;
    }
    if (newPassword !== reNewPassword) {
        res.send({
            status: 200,
            code: 0,
            message: "两次密码不一致！"
        });
        return;
    }

    usersModel.getOne({
        key: "User",
        body: {
            email: user,
            password: passwordHash
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
        
        if (data && "email" in data) {
            usersModel.update({
                _id: data._id
            }, {
                key: "User",
                body: {
                    password: NewPasswordHash
                }
            }, function (err, data) {
                if (err) {
                    res.send({
                        status: 200,
                        code: 0,
                        message: "更新失败，服务器错误，请重试！"
                    });
                    return;
                }
                req.session.user = null;
                res.send({
                    status: 200,
                    code: 1,
                    message: "密码修改成功,请重新登录！",
                    "url": "/"
                });
            });
        } else {
            res.send({
                status: 200,
                code: 0,
                message: "更新失败，旧密码错误，请重试！"
            });
            return;
        }
    });
});

// 修改头像
router.route("/editFace").get(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
        return false;
    }

    var id = req.session.user._id;

    // 先查users表的用户信息
    usersModel.getOne({
        key: "User",
        body: {
            _id: id
        }
    }, function (err, user) {
        // 再查info
        usersInfosModel.getOne({
            key: "User_info",
            body: {
                userid: req.session.user._id
            }
        }, function (err, info) {
            if (err || !info) {
                res.render('users/empty', {title:'修改头像', content:'先完善信息后才有权限修改头像。<br /><a href="/user/editInfo">点击完善信息</a>'});
            }
            res.render('users/user_face', {
                member: user,
                info: info
            });
        });
    });
}).post(function (req, res) {
    "use strict";
    // 未登录禁止上传
    if (!req.session.user) {
        res.json({state:"请登录后再上传！"});
        return false;
    }

    var busboy = new Busboy({ headers: req.headers });
    var staticPath = path.join(siteDir, 'public');
    busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
        var isReturn = false;
        save(file, filename, req, function (err, url) {
            //防止多次res.end()
            if (isReturn) return;
            isReturn = true;
            //console.log(req.body);
            var r = {
                'url': '/static' + url,
                //'title': req.body.pictitle,
                'original': filename,
            }
            if (err) {
                r.state = '图片上传失败！';
            } else r.state = 'SUCCESS';
            res.json(r);
        });
    });
    req.pipe(busboy);


    var save = function (file, filename, req, callback) {
        var realName = "face" + path.extname(filename);
        var dPath = "/users/" + req.session.user._id + "/face";
        var saveTo = path.join(os.tmpDir(), realName);

        file.pipe(fs.createWriteStream(saveTo));
        file.on('end', function() {
            var readPath = path.join(staticPath, dPath, realName);
            fse.remove(path.join(staticPath, dPath), function(error) {// 先移动原有头像文件夹
                // console.log(saveTo);
                // console.log(readPath);
                
                fse.move(saveTo, readPath, function(err) {
                    if (err) {
                        callback(err);
                    } else {
                        // 缩放图片【限制最大宽高】
                        imageMagick(readPath).resize(128, 128).noProfile().write(readPath, function() {
                            console.log("face upload ok!");
                        });
                        callback(null, dPath + '/' + realName);
                    }
                });
            });
        });
    }


    // res.send({url:"/static/upload/560262144bb4b810197a28d9/2015_11_12_16_56_44_689_1000.jpg",original:"1.jpg",state:"SUCCESS"});
});

// 修改企业logo
router.route("/editComlogo").post(function (req, res) {
    "use strict";
    // 未登录禁止上传
    if (!req.session.user) {
        res.json({state:"请登录后再上传！"});
        return false;
    }

    var comID;

    // 先获取企业id
    jobModel.getOne({
        key: "Companie",
        body: {
            manage: req.session.user._id
        }
    }, function (err, data) {
        if (err || !data) {
            res.json({state:"该会员无企业信息！"});
        }
        
        comID = data._id;
        updataLogo();
    });

    // 上传图片
    function updataLogo() {
        var busboy = new Busboy({ headers: req.headers });
        var staticPath = path.join(siteDir, 'public');
        busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
            var isReturn = false;
            save(file, filename, req, function (err, url) {
                //防止多次res.end()
                if (isReturn) return;
                isReturn = true;
                //console.log(req.body);
                var r = {
                    'url': '/static' + url,
                    //'title': req.body.pictitle,
                    'original': filename,
                }
                if (err) {
                    r.state = '图片上传失败！';
                } else r.state = 'SUCCESS';
                res.json(r);
            });
        });
        req.pipe(busboy);


        var save = function (file, filename, req, callback) {
            var realName = "logo" + path.extname(filename);
            var dPath = "/companys/" + comID + "/logo";
            var saveTo = path.join(os.tmpDir(), realName);

            file.pipe(fs.createWriteStream(saveTo));
            file.on('end', function() {
                var readPath = path.join(staticPath, dPath, realName);
                fse.remove(path.join(staticPath, dPath), function(error) {// 先移动原有头像文件夹
                    // console.log(saveTo);
                    // console.log(readPath);
                    
                    fse.move(saveTo, readPath, function(err) {
                        if (err) {
                            callback(err);
                        } else {
                            // 缩放图片【限制最大宽高】
                            imageMagick(readPath).resize(128, 128).noProfile().write(readPath, function() {
                                console.log("face upload ok!");
                            });
                            callback(null, dPath + '/' + realName);
                        }
                    });
                });
            });
        };
    };

});


// 访问我的文章【出现这个链接默认为会员访问自己发布的文章】
router.route('/myarticle').get(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
        return false;
    }

    // 跳转至用户中心页面
    res.redirect("/user/myarticle/"+req.session.user._id);
});
// 访问会员的文章
router.route('/myarticle/:id').get(function (req, res) {
    "use strict";
    var id = req.params.id,
        member;

    var urlParams = URL.parse(req.originalUrl, true).query,
        page = urlParams.page || 1,
        pagesize = urlParams.pagesize || 20,
        pathname = URL.parse(req.originalUrl, true).pathname;

    // 查询用户帐号
    usersModel.getOne({
        key: "User",
        body: {
            _id: id
        }
    }, function (err, data) {
        if (err || !data) {// 会员信息不存在
            res.render('article/error', {
                title: "错误提示",
                msg: "无此用户"
            });
        } else {// 已存在
            member = data;

            // 查询用户info
            usersInfosModel.getOne({
                key: "User_info",
                body: {
                    userid: id
                }
            }, function (err, data) {
                if (err || !data) {// 会员信息不存在
                    res.render('article/error', {
                        title: "错误提示",
                        msg: "该用户没有此类信息！"
                    });
                } else {// 已存在
                    getArticleList(req, res, {type:1, userId:id}, {page:page, pagesize:pagesize, pathname:pathname}, 'users/user_article', member, data);
                }
            });
        }
    });
});
/**
 * 获取文章列表内容
 * @param  {Object} o 限制条件
 * @param  {String} mod 模板路径
 * @param  {Object} member 用户信息
 * @return
 */
function getArticleList(req, res, o, pages, mod, member, info) {
    archiveModel.getSort({
        key: "Archive",
        body:o,// 仅读取文章类型的档案
        pages:pages, // 分页信息
        occupation: "addDate"// 排序字段
    }, function (err, data) {
        var channelCount = 0,
            userCount = 0,
            allCount;
        if (err) {
            res.send("服务器错误，请重试！");
            return;
        }

        if (data) {
            if ( data.length < 1 ) {// 没有数据的时候直接返回
                allCount = 0;
                gosend();
                return;
            }
            for ( var i=0; i<data.length; i++ ) {
                (function(i) {
                    // 获取分类信息
                    archiveModel.getOne({
                        key: "Article_channel",
                        body: {
                            _id: data[i].channelId
                        }
                    }, function (err, channelData) {
                        if (err) {
                            res.send("服务器错误，请重试！");
                            return;
                        }

                        if (channelData && channelData.name) {
                            data[i].channel = channelData.name;
                            data[i].channelUrl = channelData.url;
                            channelCount++;
                            gosend();
                            return;
                        }
                        res.send("未知错误，请重试！");
                    });

                    // 获取会员信息
                    usersModel.getOne({
                        key: "User",
                        body: {
                            _id: data[i].userId
                        }
                    }, function (err, userData) {
                        if (err) {
                            res.send("服务器错误，请重试！");
                            return;
                        }

                        if (userData) {
                            data[i].user = userData.username;
                            data[i].userId = userData._id;
                        } else {
                            data[i].user = "";
                            data[i].userId = "";
                        }
                        userCount++;
                        gosend();
                        return;
                    });
                })(i);
            }

            // 获取总数【用于分页】
            archiveModel.getAll({// 查询分类，为添加文章做准备
                key: "Archive",
                body: o
            }, function (err, data) {
                if (err) {
                    res.send("服务器错误，请重试！");
                    return;
                }

                if (data) {
                    allCount = data.length;
                    gosend();
                    return;
                }

                res.send("未知错误，请重试！");
            });

            return;
        }

        res.send("未知错误，请重试！");

        // 所有数据都获取完成后执行返回
        function gosend() {
            var _page = pages;
            if ( channelCount == data.length && userCount == data.length && allCount >= 0 ) {
                _page.sum = allCount;
                res.render(mod, {
                    title: "会员发布的文章",
                    result: data,
                    pages:_page,
                    member: member,
                    info: info
                });
           }
        };
    });
};

// 访问我参与的活动【出现这个链接默认为会员访问自己参与的活动】
router.route('/myactive').get(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
        return false;
    }

    // 跳转至用户中心页面
    res.redirect("/user/myactive/"+req.session.user._id);
});
// 访问会员与的活动
router.route('/myactive/:id').get(function (req, res) {
    "use strict";
    var id = req.params.id,
        member;

    var urlParams = URL.parse(req.originalUrl, true).query,
        page = urlParams.page || 1,
        pagesize = urlParams.pagesize || 20,
        pathname = URL.parse(req.originalUrl, true).pathname;

    // 查询用户帐号
    usersModel.getOne({
        key: "User",
        body: {
            _id: id
        }
    }, function (err, data) {
        if (err || !data) {// 会员信息不存在
            res.render('article/error', {
                title: "错误提示",
                msg: "无此用户"
            });
        } else {// 已存在
            member = data;

            // 查询用户info
            usersInfosModel.getOne({
                key: "User_info",
                body: {
                    userid: id
                }
            }, function (err, data) {
                if (err || !data) {// 会员信息不存在
                    res.render('article/error', {
                        title: "错误提示",
                        msg: "该用户没有此类信息！"
                    });
                } else {// 已存在
                    getActiveList(req, res, {mail:member.email}, {page:page, pagesize:pagesize, pathname:pathname}, 'users/user_active', member, data);
                }
            });
        }
    });
});
/**
 * 获取参与活动内容
 * @param  {Object} o 限制条件
 * @param  {Object} pages 分页参数对象
 * @param  {String} mod 模板路径
 * @param  {Object} member 用户信息
 * @param  {Object} info 用户详细信息
 * @return
 */
function getActiveList(req, res, o, pages, mod, member, info) {
    activeModel.getSort({// 获取报名信息
        key: "Active_join",
        body:o,// 仅读取文章类型的档案
        pages: pages,// 分页信息
        occupation: "addDate"// 排序字段
    }, function (err, data) {
        var joinCount = 0,
            allCount;
        if (err) {
            res.send("服务器错误，请重试！");
            return;
        }

        if (data) {
            if ( data.length < 1 ) {// 没有数据的时候直接返回
                allCount = 0;
                gosend();
                return;
            }
            
            for ( var i=0; i<data.length; i++ ) {
                (function(i) {
                    // 获取分类信息
                    activeModel.getOne({
                        key: "Active",
                        body: {
                            _id: data[i].aid
                        }
                    }, function (err, activeData) {
                        if (err) {
                            res.send("服务器错误，请重试！");
                            return;
                        }

                        if (activeData && activeData.aName) {
                            data[i].activeName = activeData.aName;
                            data[i].activeStatus = activeData.aStatus;
                            data[i].activeId = activeData._id;
                            data[i].activeChannel = activeData.aClass;
                            data[i].time = activeData.aTime;
                            joinCount++;
                            gosend();
                            return;
                        }
                        res.send("未知错误，请重试！");
                    });
                })(i);
            }

            // 获取总数【用于分页】
            activeModel.getAll({
                key: "Active_join",
                body: o
            }, function (err, data) {
                if (err) {
                    res.send("服务器错误，请重试！");
                    return;
                }

                if (data) {
                    allCount = data.length;
                    gosend();
                    return;
                }

                res.send("未知错误，请重试！");
            });
            return;
        }

        res.send("未知错误，请重试！");

        // 所有数据都获取完成后执行返回
        function gosend() {
           var _page = pages;
           if ( joinCount == data.length && allCount >= 0 ) {
                _page.sum = allCount;
                res.render(mod, {
                    title: "会员参与的活动",
                    result: data,
                    member: member,
                    info: info,
                    pages: _page
                });
           }
        };
    });
};



// 访问我的评论【出现这个链接默认为会员访问自己发布的文章】
router.route('/mycomment').get(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
        return false;
    }

    // 跳转至我的评论浏览页面
    res.redirect("/user/mycomment/"+req.session.user._id);
});
// 访问会员与的评论
router.route('/mycomment/:id').get(function (req, res) {
    "use strict";
    var id = req.params.id,
        member;

    var urlParams = URL.parse(req.originalUrl, true).query,
        page = urlParams.page || 1,
        pagesize = urlParams.pagesize || 20,
        pathname = URL.parse(req.originalUrl, true).pathname;

    // 查询用户帐号
    usersModel.getOne({
        key: "User",
        body: {
            _id: id
        }
    }, function (err, data) {
        if (err || !data) {// 会员信息不存在
            res.render('article/error', {
                title: "错误提示",
                msg: "无此用户"
            });
        } else {// 已存在
            member = data;

            // 查询用户info
            usersInfosModel.getOne({
                key: "User_info",
                body: {
                    userid: id
                }
            }, function (err, data) {
                if (err || !data) {// 会员信息不存在
                    res.render('article/error', {
                        title: "错误提示",
                        msg: "该用户没有此类信息！"
                    });
                } else {// 已存在
                    getCommentList(req, res, {userid:id, hide:false}, {page:page, pagesize:pagesize, pathname:pathname}, 'users/user_comment', member, data);
                }
            });
        }
    });
});
/**
 * 获取参与的评论
 * @param  {Object} o 限制条件
 * @param  {Object} pages 分页参数对象
 * @param  {String} mod 模板路径
 * @param  {Object} member 用户信息
 * @param  {Object} info 用户详细信息
 * @return
 */
function getCommentList(req, res, o, pages, mod, member, info) {
    var backData = [];
    commentModel.getSort({// 获取报名信息
        key: "Comment",
        body:o,// 仅读取当前会员
        pages: pages,// 分页信息
        occupation: "addDate"// 排序字段
    }, function (err, data) {
        var _page = pages;
        if (err) {
            res.send("服务器错误，请重试！");
            return;
        }

        if (data) {
            if ( data.length < 1 ) {
                _page.sum = 0;
                res.render(mod, {
                    title: "会员参与的评论",
                    result: [],
                    member: member,
                    info: info,
                    pages: _page
                });
                return false;
            }

            // 获取总数【用于分页】
            commentModel.getAll({
                key: "Comment",
                body: o
            }, function (err, comment) {
                if (err) {
                    res.send("服务器错误，请重试！");
                    return;
                }

                if (comment) {
                    _page.sum = comment.length;
                    
                    for ( var i=0; i<data.length; i++ ) {
                        if ( data[i].privacy == true ) {
                            if ( !req.session.user || (req.session.user._id != data[i].typeid && req.session.user._id != data[i].userid) ) {
                                continue;
                            }
                        }
                        backData.push(data[i]);
                    }
                    
                    // 替换 @谁 为链接后返回数据
                    replaceUserLink(backData, function(newData) {
                        res.render(mod, {
                            title: "会员参与的评论",
                            result: newData,
                            member: member,
                            info: info,
                            pages: _page
                        });
                    });
                    
                    return;
                }

                res.send("未知错误，请重试！");
            });

            return;
        }

        res.send("未知错误，请重试！");
    });

    // 会员昵称转ID【get专属，与公共方法略有不同】
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
};



// 访问我的招聘【出现这个链接默认为会员访问自己发布的招聘】
router.route('/myjob').get(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
        return false;
    }

    // 跳转至用户中心页面
    res.redirect("/user/myjob/"+req.session.user._id);
});
// 访问会员的招聘
router.route('/myjob/:id').get(function (req, res) {
    "use strict";
    var id = req.params.id,
        member;

    var urlParams = URL.parse(req.originalUrl, true).query,
        page = urlParams.page || 1,
        pagesize = urlParams.pagesize || 20,
        pathname = URL.parse(req.originalUrl, true).pathname;

    var member,
        info,
        workingLife,
        diploma,
        jobType,
        city,
        companys;

    // 查询用户帐号
    usersModel.getOne({
        key: "User",
        body: {
            _id: id
        }
    }, function (err, _member) {
        if (err || !_member) {// 会员信息不存在
            res.render('article/error', {
                title: "错误提示",
                msg: "无此用户"
            });
        } else {// 已存在
            member = _member;

            // 查询用户info
            usersInfosModel.getOne({
                key: "User_info",
                body: {
                    userid: id
                }
            }, function (err, _info) {
                if (err || !_info) {// 会员信息不存在
                    res.render('article/error', {
                        title: "错误提示",
                        msg: "该用户没有此类信息！"
                    });
                } else {// 已存在
                    info = _info;
                    getJobChannelCon();
                }
            });
        }
    });

    /**
     * 获取招聘相关分类信息
     */
    function getJobChannelCon() {
        getJobChannelData({parent:5}, function(_workingLife) {
            getJobChannelData({parent:6}, function(_diploma) {
                getJobChannelData({parent:7}, function(_jobType) {
                    getJobChannelData({parent:8}, function(_city) {
                        workingLife = _workingLife;
                        diploma = _diploma;
                        jobType = _jobType;
                        city = _city;
                        getCompanys()
                    });
                });
            });
        });
    };

    /**
     * 获取本人关联企业信息
     */
    function getCompanys() {
        jobModel.getOne({
            key: "Companie",
            body: {
                manage: id
            }
        }, function (err, _companys) {
            if (err || !_companys) {// 企业信息不存在
                res.render('article/error', {
                    title: "错误提示",
                    msg: "该用户没有关联企业信息！"
                });
            } else {// 已存在
                getJobChannelData({parent:2}, function(realm) {
                    getJobChannelData({parent:3}, function(scale) {
                        getJobChannelData({parent:4}, function(seedtime) {
                            var realmData = [];
                            // 转化企业领域为汉字
                            for ( var x=0; x<realm.length; x++ ) {
                                var thisid = realm[x]._id;
                                if ( _companys.realm.indexOf(thisid) > -1 ) {
                                    realmData.push(realm[x].name);
                                }
                            }
                            _companys.realmName = realmData.join(" · ");
                            // 转化企业规模为汉字
                            for ( var j=0; j<scale.length; j++ ) {
                                if ( scale[j]._id == _companys.scale ) {
                                    _companys.scaleName = scale[j].name;
                                }
                            }
                            // 转化发展阶段为汉字
                            for ( var k=0; k<seedtime.length; k++ ) {
                                if ( seedtime[k]._id == _companys.seedtime ) {
                                    _companys.seedtimeName = seedtime[k].name;
                                }
                            }

                            companys = _companys;
                            getList();
                        });
                    });
                });
            }
        });
    };

    /**
     * 获取本人招聘列表
     */
    function getList() {
        getJobList(req, res, {type:3, userId:id}, {page:page, pagesize:pagesize, pathname:pathname}, 'users/user_job', member, info, {
            workingLife: workingLife,
            diploma: diploma,
            jobType: jobType,
            city: city
        }, companys);
    };
});
/**
 * 获取招聘列表内容
 * @param  {Object} o 限制条件
 * @param  {String} mod 模板路径
 * @param  {Object} member 用户信息
 * @return
 */
function getJobList(req, res, o, pages, mod, member, info, relyData, companys) {
    archiveModel.getSort({
        key: "Archive",
        body:o,// 仅读取文章类型的档案
        pages:pages, // 分页信息
        occupation: {"sortup":-1, "rank":-1, "editDate":-1}// 排序字段
    }, function (err, data) {
        var channelCount = 0,
            userCount = 0,
            allCount;
        if (err) {
            res.send("服务器错误，请重试！");
            return;
        }

        if (data) {
            if ( data.length < 1 ) {// 没有数据的时候直接返回
                allCount = 0;
                gosend();
                return;
            }
            for ( var i=0; i<data.length; i++ ) {
                (function(i) {
                    // 转化工作年限为汉字
                    for ( var j=0; j<relyData.workingLife.length; j++ ) {
                        if ( relyData.workingLife[j]._id == data[i].workingLife ) {
                            data[i].workingLifeName = relyData.workingLife[j].name;
                        }
                    }
                    // 转化学历为汉字
                    for ( var k=0; k<relyData.diploma.length; k++ ) {
                        if ( relyData.diploma[k]._id == data[i].diploma ) {
                            data[i].diplomaName = relyData.diploma[k].name;
                        }
                    }
                    // 转化招聘类型为汉字
                    for ( var y=0; y<relyData.jobType.length; y++ ) {
                        if ( relyData.jobType[y]._id == data[i].jobType ) {
                            data[i].jobTypeName = relyData.jobType[y].name;
                        }
                    }
                    // 转化城市为汉字
                    for ( var z=0; z<relyData.city.length; z++ ) {
                        if ( relyData.city[z]._id == data[i].city ) {
                            data[i].cityName = relyData.city[z].name;
                        }
                    }


                    // 获取分类信息
                    jobModel.getOne({
                        key: "Job_channel",
                        body: {
                            _id: data[i].channelId
                        }
                    }, function (err, channelData) {
                        if (err) {
                            res.send("服务器错误，请重试！");
                            return;
                        }

                        if (channelData && channelData.name) {
                            data[i].channel = channelData.name;
                            data[i].channelUrl = channelData.url;
                            channelCount++;
                            gosend();
                            return;
                        }
                        res.send("未知错误，请重试！");
                    });

                    // 获取会员信息
                    usersModel.getOne({
                        key: "User",
                        body: {
                            _id: data[i].userId
                        }
                    }, function (err, userData) {
                        if (err) {
                            res.send("服务器错误，请重试！");
                            return;
                        }

                        if (userData) {
                            data[i].user = userData.username;
                            data[i].userId = userData._id;
                        } else {
                            data[i].user = "";
                            data[i].userId = "";
                        }
                        userCount++;
                        gosend();
                        return;
                    });
                })(i);
            }

            // 获取总数【用于分页】
            archiveModel.getAll({// 查询分类，为添加文章做准备
                key: "Archive",
                body: o
            }, function (err, data) {
                if (err) {
                    res.send("服务器错误，请重试！");
                    return;
                }

                if (data) {
                    allCount = data.length;
                    gosend();
                    return;
                }

                res.send("未知错误，请重试！");
            });

            return;
        }

        res.send("未知错误，请重试！");

        // 所有数据都获取完成后执行返回
        function gosend() {
            var _page = pages;
            if ( channelCount == data.length && userCount == data.length && allCount >= 0 ) {
                _page.sum = allCount;
                res.render(mod, {
                    title: "会员发布的招聘",
                    result: data,
                    pages:_page,
                    member: member,
                    info: info,
                    companys: companys
                });
           }
        };
    });
};
/**
 * 获取招聘分类数据
 * @param  {Object} o 筛选对象
 * @param  {Function} callback 查询完的回调
 */
function getJobChannelData(o, callback) {
    jobModel.getSort({
        key: "Job_channel",
        body:o,// 筛选条件
        pages:{page:1, pagesize:1000, pathname:""}, // 分页信息
        occupation: "order"// 排序字段
    }, function (err, data) {
        var items = data;
        if (err || !data) {
            items = [];
        }
        
        if ( callback ) {
            callback(items);
        }
    });
};


// 访问我的面试记录
router.route('/myjobapply').get(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
        return false;
    }

    var id = req.session.user._id,
        member;

    var urlParams = URL.parse(req.originalUrl, true).query,
        page = urlParams.page || 1,
        pagesize = urlParams.pagesize || 20,
        pathname = URL.parse(req.originalUrl, true).pathname;

    // 查询用户帐号
    usersModel.getOne({
        key: "User",
        body: {
            _id: id
        }
    }, function (err, data) {
        if (err || !data) {// 会员信息不存在
            res.render('article/error', {
                title: "错误提示",
                msg: "无此用户"
            });
        } else {// 已存在
            member = data;

            // 查询用户info
            usersInfosModel.getOne({
                key: "User_info",
                body: {
                    userid: id
                }
            }, function (err, data) {
                if (err || !data) {// 会员信息不存在
                    res.render('article/error', {
                        title: "错误提示",
                        msg: "该用户没有此类信息！"
                    });
                } else {// 已存在
                    getJobApplyList(req, res, {userid:id}, {page:page, pagesize:pagesize, pathname:pathname}, 'users/user_jobApply', member, data);
                }
            });
        }
    });
});
/**
 * 获取面试记录
 * @param  {Object} o 限制条件
 * @param  {Object} pages 分页参数对象
 * @param  {String} mod 模板路径
 * @param  {Object} member 用户信息
 * @param  {Object} info 用户详细信息
 * @return
 */
function getJobApplyList(req, res, o, pages, mod, member, info) {
    jobModel.getSort({// 获取列表信息
        key: "Sent_resume",
        body:o,// 条件
        pages: pages,// 分页信息
        occupation: "addDate"// 排序字段
    }, function (err, data) {
        var allCount;
        if (err) {
            res.send("服务器错误，请重试！");
            return;
        }

        if (data) {
            if ( data.length < 1 ) {// 没有数据的时候直接返回
                allCount = 0;
                gosend();
                return;
            }

            // 获取总数【用于分页】
            jobModel.getAll({
                key: "Sent_resume",
                body: o
            }, function (err, data) {
                if (err) {
                    res.send("服务器错误，请重试！");
                    return;
                }

                if (data) {
                    allCount = data.length;
                    gosend();
                    return;
                }

                res.send("未知错误，请重试！");
            });
            return;
        }

        res.send("未知错误，请重试！");

        // 所有数据都获取完成后执行返回
        function gosend() {
           var _page = pages;
           if ( allCount >= 0 ) {
                _page.sum = allCount;
                res.render(mod, {
                    title: "我的求职纪录",
                    result: data,
                    member: member,
                    info: info,
                    pages: _page
                });
           }
        };
    });
};




// 访问我的留言【出现这个链接默认为会员访问自己的留言】
router.route('/message').get(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
        return false;
    }

    // 跳转至用户中心页面
    res.redirect("/user/message/"+req.session.user._id);
});
// 访问会员的留言
router.route('/message/:id').get(function (req, res) {
    "use strict";
    var id = req.params.id,
        member;

    // 查询用户帐号
    usersModel.getOne({
        key: "User",
        body: {
            _id: id
        }
    }, function (err, data) {
        if (err || !data) {// 会员信息不存在
            res.render('article/error', {
                title: "错误提示",
                msg: "无此用户"
            });
        } else {// 已存在
            member = data;

            // 查询用户info
            usersInfosModel.getOne({
                key: "User_info",
                body: {
                    userid: id
                }
            }, function (err, data) {
                if (err || !data) {// 会员信息不存在
                    res.render('article/error', {
                        title: "错误提示",
                        msg: "该用户未完善会员信息，不支持留言功能！"
                    });
                } else {// 已存在
                    if ( req.session.addCommentIsShowCaptcha && req.session.addCommentIsShowCaptcha >= config.isShowCaptcha ) {// 显示验证码
                        res.render('users/user_message', {
                            title: "会员留言",
                            member: member,
                            info: data,
                            configIsComment: config.isComment,
                            captcha:true
                        });
                    } else {
                        // 不显示验证码时需要清空验证码session
                        req.session.captcha = null;
                        res.render('users/user_message', {
                            title: "会员留言",
                            member: member,
                            info: data,
                            configIsComment: config.isComment
                        });
                    }
                    
                }
            });
        }
    });
});


/*
// 更新邮件地址
// 输入新的邮箱地址，发送激活邮件
router.route("/email").all(authorize).get(function (req, res) {
    "use strict";
    usersModel.getAll({
        key: "Category"
    }, function (err, categories) {
        if (err) {
            categories = [];
        }
        res.render('admin/email', {
            categories: categories,
            cur: "email"
        });
    });
}).post(function (req, res) {
    "use strict";
    var email = req.session.user.email,
        newEmail = req.body.email,
        regCode = crypto.createHash("sha1").update(new Buffer(newEmail + (Math.random() * 10000000000).toFixed(0), "binary")).digest('hex');

    if (email === newEmail) {
        res.send({
            status: 200,
            code: 0,
            message: "不要调皮哦，你就没有修改邮箱嘛！"
        });
        return false;
    }

    usersModel.getOne({
        key: "User",
        body: {
            email: newEmail
        }
    }, function (err, user) {
        if (err || user) {
            res.send({
                status: 200,
                code: 0,
                message: "不要调皮哦，此邮件地址已经被使用！"
            });
        } else {
            usersModel.getOne({
                key: "User",
                body: {
                    email: email
                }
            }, function (err, user) {
                if (err || !user) {
                    res.send({
                        status: 200,
                        code: 0,
                        message: "更新邮箱失败，服务器错误！"
                    });
                } else if (user.changeTimes >= config.changeTimes) {
                    res.send({
                        status: 200,
                        code: 0,
                        message: "更新邮箱失败，已经超过允许更换邮箱的最大次数！"
                    });
                } else {
                    usersModel.update({
                        email: email
                    }, {
                        key: "User",
                        body: {
                            changeEmail: newEmail,
                            "regCode": regCode,
                            "isActive": false
                        }
                    }, function (err, num) {
                        if (err || num < 1) {
                            res.send({
                                status: 200,
                                code: 0,
                                message: "更新邮箱失败，服务器错误！"
                            });
                        } else {
                            sendMail({
                                from: config.mail.sendMail,
                                to: newEmail,
                                subject: '更换邮件重新激活账户',
                                html: '感谢您使用' + config.title + '，以下是您新邮箱的激活链接，\n\r <a href="' + config.url + '/updateEmail/' + regCode + '">' + config.url + '/updateEmail/' + regCode + '</a>请点击链接以激活您的账户！'
                            });
                            res.send({
                                status: 200,
                                code: 1,
                                message: "已向新邮箱地址发送激活邮件成功，请稍后收取邮件并点击激活链接以激活账户！"
                            });
                        }
                    });

                }
            });
        }
    });
});

// 更换邮件地址
// 点击激活链接 更换新邮件地址
router.route("/updateEmail/:code").all(authorize).get(function (req, res) {
    "use strict";
    var code = req.params.code;

    if (!code) {
        usersModel.getAll({
            key: "Category"
        }, function (err, categories) {
            if (err) {
                categories = [];
            }
            res.render('admin/error', {
                categories: categories,
                err: "服务器错误或激活码链接有错，请重试！"
            });
        });
        return false;
    }

    usersModel.getOne({
        key: "User",
        body: {
            regCode: code
        }
    }, function (err, user) {
        if (err || !user) {
            res.send({
                status: 200,
                code: 0,
                message: "服务器错误或激活码链接有错，请重试！"
            });
        } else {

            usersModel.update({
                regCode: code
            }, {
                key: "User",
                body: {
                    email: user.changeEmail,
                    changeTimes: user.changeTimes + 1,
                    regCode: "",
                    "isActive": true
                }
            }, function (err, num) {
                if (err || num < 1) {
                    res.send({
                        status: 200,
                        code: 0,
                        message: "更新邮箱失败，服务器错误！"
                    });
                } else {
                    if (user.regCode && !user.isActive) {
                        sendMail({
                            from: config.mail.sendMail,
                            to: user.changeEmail,
                            subject: '邮箱更新成功',
                            html: '感谢您对' + config.title + '的厚爱，您的邮箱已成功更换，可以正常使用，访问：' + config.url
                        });
                        req.session.user = null;
                        res.send({
                            status: 200,
                            code: 1,
                            message: "您的邮箱已成功更换，可以正常使用，请重新登录！"
                        });
                    } else {
                        res.send({
                            status: 500,
                            code: 0,
                            message: "此链接已失效，请不要重复点击此链接哦！"
                        });
                    }
                }
            });
        }
    });
});
 */



/**
 * 获取用户头像相关
 */

// 读取并返回文件列表
function geFileList(path) {
    var filesList = [];
    readFile(path, filesList);
    return filesList;
}
//遍历读取文件
function readFile(path, filesList) {
    files = fs.readdirSync(path); //需要用到同步读取
    files.forEach(walk);

    function walk(file) {
        states = fs.statSync(path + '/' + file);
        if (states.isDirectory()) {
            readFile(path + '/' + file, filesList);
        } else {
            //创建一个对象保存信息
            var obj = new Object();
            obj.size = states.size; //文件大小，以字节为单位
            obj.name = file; //文件名
            obj.path = path + '/' + file; //文件绝对路径
            filesList.push(obj);
        }
    }
}

/**
 * path:   /user/face/:id
 * 获取用户头像
 */
router.route('/face/:id').get(function (req, res) {
    // 头像路径不存数据库，上传头像的直接创建ID命名的图片，没上传的显示默认头像
    var id = req.params.id,
        userPath = path.join(__dirname, '../public/users/'+id+'/face'),
        defaultPath = path.join(__dirname, '../public/users/default-face.png'),
        faceFileName;

    if ( !fs.existsSync(userPath) ) {// 会员头像文件夹不存在时
        // console.log("no");
        _send(defaultPath, "png");
    } else if ( geFileList(userPath).length < 1 ) {// 文件夹存在，但没有文件
        // console.log("yes");
        _send(defaultPath, "png");
    } else {// 有文件时的处理【我们的face目录下默认只会显示一张图片】
        faceFileName = geFileList(userPath)[0].name;
        // console.log("ok");
        _send(userPath +'/'+ faceFileName, faceFileName.substring(faceFileName.indexOf(".")+1));
    }
    
    /**
     * 返回图片信息
     * @param  {String} _path 需要返回图片的路径
     * @param  {String} _type 图片后缀
     * @return
     */
    function _send(_path, _type) {
        fs.readFile(_path, function (err, img) {
            res.writeHead('200', {'Content-Type': 'image/'+_type});    //写http头部信息
            res.end(img, 'binary');
        });
    };
});

/**
 * path:  /user/comlogo/:id
 * 获取企业logo
 */
router.route('/comlogo/:id').get(function (req, res) {
    // logo路径不存数据库，上传logo的直接创建ID命名的图片，没上传的显示默认头像
    var id = req.params.id,
        userPath = path.join(__dirname, '../public/companys/'+id+'/logo'),
        defaultPath = path.join(__dirname, '../public/companys/default-logo.png'),
        logoFileName;

    if ( !fs.existsSync(userPath) ) {// 企业logo文件夹不存在时
        _send(defaultPath, "png");
    } else if ( geFileList(userPath).length < 1 ) {// 文件夹存在，但没有文件
        _send(defaultPath, "png");
    } else {// 有文件时的处理【我们的logo目录下默认只会显示一张图片】
        logoFileName = geFileList(userPath)[0].name;
        _send(userPath +'/'+ logoFileName, logoFileName.substring(logoFileName.indexOf(".")+1));
    }
    
    /**
     * 返回图片信息
     * @param  {String} _path 需要返回图片的路径
     * @param  {String} _type 图片后缀
     * @return
     */
    function _send(_path, _type) {
        fs.readFile(_path, function (err, img) {
            res.writeHead('200', {'Content-Type': 'image/'+_type});    //写http头部信息
            res.end(img, 'binary');
        });
    };
});


/**
 * 用户帐号相关
 */

// 找回密码
router.route('/forgotPassword').get(function (req, res) {
    "use strict";
    if (req.session.user) { // 如果登录直接返回前一个页面
        res.redirect(goBack(req.headers.referer));
    }
    if ( req.session.forgotPasswordIsShowCaptcha && req.session.forgotPasswordIsShowCaptcha >= config.isShowCaptcha ) {// 显示验证码
        res.render('users/forgotPassword', {captcha:true});
    } else {
        // 不显示验证码时需要清空验证码session
        req.session.captcha = null;
        res.render('users/forgotPassword', {});
    }
});
// 找回密码提交
router.route('/forgotPassword').post(function (req, res) {
    "use strict";
    var email = req.body.email,
        resetCode = (Math.random() * 10000000000).toFixed(0),
        hash = crypto.createHash("sha1").update(new Buffer(email + resetCode, "binary")).digest('hex'),
        code = req.body.code;

    // 验证码错误
    if ( req.session.forgotPasswordIsShowCaptcha >= config.isShowCaptcha ) {//需要检查验证码的正确性
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

    // 记录该用户登录的次数
    if ( req.session.forgotPasswordIsShowCaptcha ) {
        req.session.forgotPasswordIsShowCaptcha++;
    } else {
        req.session.forgotPasswordIsShowCaptcha = 1;
    }

    usersModel.getOne({
        key: "User",
        body: {
            email: email
        }
    }, function (err, data) {

        // 通过验证请求时清空验证码session
        req.session.captcha = null;

        if (err) {
            res.send({
                status: 200,
                code: 0,
                message: "找回密码失败，服务器错误，请重试！"
            });
        }
        if (data && "email" in data) {
            usersModel.getOne({
                key: "ResetPW",
                body: {
                    email: email
                }
            }, function (err, data) {
                if (err) {
                    res.send({
                        status: 200,
                        code: 0,
                        message: "找回密码失败，服务器错误，请重试！"
                    });
                }
                if (data && "email" in data && data.hash) {
                    sendMail({
                        from: config.mail.sendMail,
                        to: email,
                        subject: 'WDShare会员密码重置邮件',
                        html: '以下是您的密码重置链接：<br /> <a href="' + config.url + '/user/forgotPassword/' + data.hash + '">' + config.url + '/user/forgotPassword/' + data.hash + '</a><br />请访问链接以重设您的密码！' + config.mailSignature
                    });
                    res.send({
                        status: 200,
                        code: 1,
                        message: "找回密码成功，请收取邮件并重设密码！",
                        url: "/"
                    });
                } else {
                    usersModel.update({
                        email: email
                    }, {
                        key: "ResetPW",
                        body: {
                            email: email,
                            resetCode: resetCode,
                            hash: hash
                        },
                        option: {
                            upsert: true
                        }
                    }, function (err, data) {
                        if (err) {
                            res.send({
                                status: 200,
                                code: 0,
                                message: "找回密码失败，服务器错误，请重试！"
                            });
                        } else {
                            sendMail({
                                from: config.mail.sendMail,
                                to: email,
                                subject: 'WDShare会员密码重置邮件',
                                html: '以下是您的密码重置链接：<br /> <a href="' + config.url + '/user/forgotPassword/' + hash + '">' + config.url + '/user/forgotPassword/' + hash + '</a><br />请访问链接重置您的密码！' + config.mailSignature
                            });
                            res.send({
                                status: 200,
                                code: 1,
                                message: "找回密码成功，稍后请收取邮件并重设密码！",
                                url: "/"
                            });
                        }
                    });
                }
            });

        } else {
            res.send({
                status: 200,
                code: 0,
                message: "找回密码失败，无此用户，请重试！"
            });
        }
    });
});

// 访问重置密码链接
router.route('/forgotPassword/:hash').get(function (req, res) {
    "use strict";
    var hash = req.params.hash;
    if (hash) {
        usersModel.getOne({
            key: "ResetPW",
            body: {
                hash: hash
            }
        }, function (err, data) {
            if (err || !data) {
                res.render('users/forgotPassword', {
                    title: "找回密码错误",
                    error: "服务器错误或链接已失效，请重新找回！"
                });
            } else {
                // 输入新密码
                res.render("users/resetPassword", {
                    title: '输入新的密码',
                    hash: hash
                });
            }
        });
    } else {
        res.redirect("/forgotPassword");
    }
});

// 更新新密码  目前实现有漏洞概率非常非常非常小
router.post('/resetPassword/:hash', function (req, res) {
    "use strict";
    var password = req.body.password,
        rePassword = req.body.repassword,
        hash = req.body.hash || req.params.hash,
        passwordHash = crypto.createHash("sha1").update(new Buffer(password, "binary")).digest('hex');


    if (password.length < 6 || password !== rePassword) {
        res.send({
            status: 200,
            code: 0,
            message: "新密码强度不符合要求或两次密码不一致！"
        });
        return;
    }
    if (!hash) {
        res.send({
            status: 200,
            code: 0,
            message: "链接错误，请重试！"
        });
        return;
    }

    usersModel.getOne({
        key: "ResetPW",
        body: {
            hash: hash
        }
    }, function (err, data) {
        var email = data && data.email;
        if (err) {
            res.send({
                status: 200,
                code: 0,
                message: "服务器错误，请重试！"
            });
            return;
        }
        if (data && "email" in data && email) {
            usersModel.update({
                email: email
            }, {
                key: "User",
                body: {
                    password: passwordHash
                }
            }, function (err, data) {
                if (err || data.length < 1) {
                    res.send({
                        status: 200,
                        code: 0,
                        message: "重置密码失败，服务器错误，请重试！"
                    });
                    return false;
                }
                usersModel.remove({
                    key: "ResetPW",
                    body: {
                        email: email
                    }
                }, function (err, data) {});
                res.send({
                    status: 200,
                    code: 1,
                    message: "重置密码成功,请重新登录！",
                    "url": "/"
                });
            });
        } else {
            res.send({
                status: 200,
                code: 0,
                message: "重置密码失败，链接错误，请重试！"
            });
            return false;
        }
    });
});

// 激活账户页面-提示
router.get("/activeAccount/", function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
    }

    var email = req.session.user.email;

    usersModel.getOne({
        key: "User",
        body: {
            email: email
        }
    }, function (err, user) {
        if (err || !user) {
            res.render('users/empty', {title:'激活账户提示', content:'服务器错误，请稍后尝试刷新！'});
        } else {
            if ( !user.regCode && user.isActive ) {
                res.redirect("/user/");
                return false;
            }
            res.render('users/empty', {title:'激活账户提示', content:'1. 请从邮箱中点击激活链接进行账户激活，否则无法正常使用会员功能。<br />2. 如果没有收到激活邮件请点击<a href="#" id="reGetActiveAccountMail">重新发送激活邮件</a>'});
        }
    });
});
// 激活账户页面-激活
router.get("/activeAccount/:code", function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.redirect("/user/login");
        return false;
    }
    var code = req.params.code;
    var email = req.session.user.email;

    usersModel.getOne({
        key: "User",
        body: {
            email: email
        }
    }, function (err, user) {
        if (err || !user) {
            res.render('users/empty', {title:'激活账户提示', content:'服务器错误，请稍后尝试刷新！'});
        } else {
            if ( !user.regCode && user.isActive ) {
                res.redirect("/user/");
                return false;
            }
            if ( user.regCode !== code ) {
                res.render('users/empty', {title:'激活账户提示', content:'你的激活链接好像不正确，请点击<a href="#" id="reGetActiveAccountMail">重新发送激活邮件</a>'});
                return false;
            }
            if (user.regCode && !user.isActive) {
                res.render('users/empty', {title:'激活账户提示', regCode:user.regCode, content:'正在激活账户，请不要关闭浏览器...'});
            } else {
                res.render('users/empty', {title:'激活账户提示', content:'不要重复激活啦，<a href="/">返回首页</a>'});
            }
        }
    });
});
// 激活账户    /*可以通过先登录，然后再激活的方案来防止被错误激活。*/
// AJAX
router.get("/activeAccountAjax/:code", function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.send({
            status: 500,
            code: 0,
            message: "请先登录后再进行账户激活！"
        });
        return false;
    }
    var code = req.params.code,
        email;
    usersModel.getOne({
        key: "User",
        body: {
            regCode: code
        }
    }, function (err, user) {
        if (err || !user) {
            res.send({
                status: 200,
                code: 0,
                message: "账户激活失败，服务器错误，请重试！"
            });
        } else {
            email = user.email;
            usersModel.update({
                regCode: code,
                email: email
            }, {
                key: "User",
                body: {
                    isActive: true,
                    "regCode": ""
                }
            }, function (err, num) {
                if (err || num < 1) {
                    res.send({
                        status: 200,
                        code: 0,
                        message: "账户激活失败，服务器错误或登录账户和激活链接不匹配，请重试！"
                    });
                } else {
                    sendMail({
                        from: config.mail.sendMail,
                        to: email,
                        subject: '激活成功',
                        html: '感谢您注册' + config.title + '，您的账户已成功激活，可以正常使用，请访问：' + config.url + config.mailSignature
                    });

                    // 再次请求数据以便更新session
                    usersModel.getOne({
                        key: "User",
                        body: {
                            email: email
                        }
                    }, function(err, user) {
                        if (err || !user) {
                            res.send({
                                status: 200,
                                code: 0,
                                message: "账户激活失败，服务器错误，请重试！"
                            });
                        } else {
                            req.session.user = user;
                            res.send({
                                status: 200,
                                code: 1,
                                message: "账户已成功激活，感谢您的使用！",
                                url: "/user/"
                            });
                        }
                    });
                    
                }
            });
        }
    });
});
// 发送激活邮件
// AJAX
router.route("/activeAccountAjax").get(function (req, res) {
    "use strict";
    if (!req.session.user) {
        res.send({
            status: 500,
            code: 0,
            message: "请先登录后再进行账户激活！"
        });
        return false;
    }

    var email = req.session.user.email,
        duration = config.activeDuration * 60 * 1000,
        msTime = (new Date).getTime(),
        time;

    usersModel.getOne({
        key: "User",
        body: {
            email: email
        }
    }, function (err, user) {
        if (err || !user) {
            res.send({
                status: 200,
                code: 0,
                message: "发送激活邮件失败，服务器错误，请重试！"
            });
        } else {
            time = user.activeTime;
            if (time !== 0 && (msTime - time <= duration)) {
                res.send({
                    status: 200,
                    code: 0,
                    message: "请勿频繁获取激活邮件，系统设置时间间隔为" + config.activeDuration + "分钟，请" + ((duration - (msTime - time)) / 1000).toFixed(0) + "秒后获取！"
                });
                return false;
            }
            if (user.regCode && !user.isActive) {
                sendMail({
                    from: config.mail.sendMail,
                    to: email,
                    subject: '注册成功',
                    html: '感谢您注册' + config.title + '，以下是您的激活链接，\n\r <a href="' + config.url + '/user/activeAccount/' + user.regCode + '">' + config.url + '/user/activeAccount/' + user.regCode + '</a>请点击链接以激活您的账户！' + config.mailSignature
                });
                usersModel.update({
                    email: email
                }, {
                    key: "User",
                    body: {
                        activeTime: msTime
                    }
                }, function (err, num) {});
                res.send({
                    status: 200,
                    code: 1,
                    message: "发送激活邮件成功，请稍后收取邮件并点击激活链接以激活账户！"
                });
            } else {
                res.send({
                    status: 500,
                    code: 0,
                    message: "请不要重复请求激活邮件！"
                });
            }
        }
    });
});

//登录
router.get('/login', function (req, res) {
    "use strict";
    if (req.session.user) { // 如果登录直接返回前一个页面
        res.redirect(goBack(req.headers.referer));
    }
    
    // console.log(req.session.captcha);
    // console.log(req.session.loginIsShowCaptcha);
    // req.session.loginIsShowCaptcha = 0;
    if ( req.session.loginIsShowCaptcha && req.session.loginIsShowCaptcha >= config.isShowCaptcha ) {// 显示验证码
        res.render('users/login', {captcha:true});
    } else {
        // 不显示验证码时需要清空验证码session
        req.session.captcha = null;
        res.render('users/login', {});
    }
    
});

router.route('/login').post(function (req, res) {
    "use strict";
    if (req.session.user) {
        res.send({
            status: 403,
            message: "请不要重复登录！"
        });
    }
    var email = req.body.email,
        password = req.body.password,
        code = req.body.code,
        hash = crypto.createHash("sha1").update(new Buffer(password, "binary")).digest('hex');

    // 验证码错误
    if ( req.session.loginIsShowCaptcha >= config.isShowCaptcha ) {//需要检查验证码的正确性
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

    // 记录该用户登录的次数
    if ( req.session.loginIsShowCaptcha ) {
        req.session.loginIsShowCaptcha++;
    } else {
        req.session.loginIsShowCaptcha = 1;
    }


    usersModel.getOne({
        key: "User",
        body: {
            email: email,
            password: hash
        }
    }, function (err, data) {

        // 通过验证请求时清空验证码session
        req.session.captcha = null;

        if (err) {
            res.send({
                status: 200,
                code: 0,
                message: "登录失败，服务器错误，请重试！"
            });
        }
        if (data && "email" in data) {

            // 如果用户被锁定，禁止登录
            if ( data.lock ) {
                res.send({
                    status: 200,
                    code: 0,
                    message: "<span style='color:#f00;'>该账户被锁定！</span><br /><br />原因：" + data.lockMessage +"<br />请联系管理员开通帐号，邮箱：manage@wdshare.org"
                });
                return;
            }

            req.session.user = data;

            // 更新最后登录日期和IP
            // console.log(req.session.user.email);
            usersModel.update({
                email: req.session.user.email
            }, {
                key: "User",
                body: {
                    lastLoginIp: req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                    lastLoginTime: (new Date()).getTime()
                }
            }, function (err, num, data) {
                // console.log("err"+err);
                // console.log(num);
                // console.log("data"+data);
            });

            // 向页面输出信息
            res.send({
                status: 200,
                code: 1,
                message: "登录成功！",
                "url": goBack(req.headers.referer)
            });
        } else {
            res.send({
                status: 200,
                code: 0,
                message: "登录失败，用户或密码错误，请重试！"
            });
        }
    });
});

// 注册
router.get('/register', function (req, res) {
    "use strict";
    if (req.session.user) {
        res.redirect(goBack(req.headers.referer));
    }
    
    // console.log(req.session.captcha);
    // console.log(req.session.regIsShowCaptcha);
    // req.session.regIsShowCaptcha = 0;
    if ( req.session.regIsShowCaptcha && req.session.regIsShowCaptcha >= config.isShowCaptcha ) {// 显示验证码
        res.render('users/reg', {captcha:true});
    } else {
        // 不显示验证码时需要清空验证码session
        req.session.captcha = null;
        res.render('users/reg', {});
    }
});

router.post('/register', function (req, res) {
    "use strict";
    var email = req.body.email,
        password = req.body.password,
        repassword = req.body.repassword,
        code = req.body.code,
        hash = crypto.createHash("sha1").update(new Buffer(password, "binary")).digest('hex'),
        regCode = crypto.createHash("sha1").update(new Buffer(email + (Math.random() * 10000000000).toFixed(0), "binary")).digest('hex');

    // 验证码错误
    if ( req.session.regIsShowCaptcha >= config.isShowCaptcha ) {//需要检查验证码的正确性
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
    

    // 记录该用户登录的次数
    if ( req.session.regIsShowCaptcha ) {
        req.session.regIsShowCaptcha++;
    } else {
        req.session.regIsShowCaptcha = 1;
    }


    if (email.length < 5 || !/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i.test(email) || password.length < 6 || password !== repassword) {
        res.send({
            status: 200,
            message: "用户名和密码不符合要求！"
        });
        return;
    }

    usersModel.getOne({
        key: "User",
        body: {
            email: email
        }
    }, function (err, data) {

        // 通过验证请求时清空验证码session
        req.session.captcha = null;

        if (err) {
            res.send({
                status: 200,
                code: 0,
                message: "服务器错误，请重试！"
            });
            return;
        }

        if (data && data.email) {
            res.send({
                status: 200,
                code: 0,
                message: "用户已存在！"
            });
            return;
        }

        usersModel.save({
            key: "User",
            body: {
                email: email,
                username: email,
                password: hash,
                // age: 18, // 注释掉的将迁移至会员信息表中
                lastLoginTime: 0,
                lastLoginIp: "",
                regTime: (new Date()).getTime(),
                regIp: req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
                // sex: null,
                // role: 5,
                // score: 0,
                regCode: regCode,
                isActive: 0,
                activeTime: 0,
                changeEmail: email,
                changeTimes: 0,
                lock: false,
                lockTime: 0,
                lockMessage: ""

            }
        }, function (err, data) {

            if (err) {
                res.send({
                    status: 200,
                    code: 0,
                    message: err
                });
            }
            req.session.user = data;
            sendMail({
                from: config.mail.sendMail,
                to: email,
                subject: '注册成功',
                html: '感谢您注册' + config.title + '，以下是您的激活链接，\n\r <a href="' + config.url + '/user/activeAccount/' + regCode + '">' + config.url + '/user/activeAccount/' + regCode + '</a>请点击链接以激活您的账户！' + config.mailSignature
            });
            res.send({
                status: 200,
                code: 1,
                message: "注册成功，稍后请查询您的邮箱以激活账户！",
                "url": goBack(req.headers.referer)
            });
        });
    });
});

router.get('/logout', function (req, res) {
    "use strict";
    if (req.session.user) {
        req.session.user = null;
    }
    res.redirect(goBack(req.headers.referer));
});


// 个人主页
router.route('/:id').get(function (req, res) {
    "use strict";
    var id = req.params.id;
    if (id) {
        usersModel.getOne({
            key: "User",
            body: {
                _id: id
            }
        }, function (err, data) {
            if (err) {
                res.render('404');
                return false;
            }
            // 账户被锁定
            if (data.lock) {
                res.render('users/empty', {title:'该账户被锁定', content:"原因："+ data.lockMessage + "<br/>请联系管理员开通帐号，邮箱：manage@wdshare.org"});
                return false;
            }

            if (req.session.user && req.session.user._id == id) {
                // 查询info表是否有内容，没有直接跳转至信息填写
                usersInfosModel.getOne({
                    key: "User_info",
                    body: {
                        userid: id
                    }
                }, function (err, infodata) {
                    if (err || !infodata) {
                        res.redirect("/user/editInfo");
                    } else {
                        res.render("users/user_home", {title:"个人主页", member:data, info:infodata});
                    }
                });
            } else {
                usersInfosModel.getOne({
                    key: "User_info",
                    body: {
                        userid: id
                    }
                }, function (err, infodata) {
                    if (err || !infodata) {
                        res.render("users/user_home", {title:"个人主页", member:data});
                    } else {
                        res.render("users/user_home", {title:"个人主页", member:data, info:infodata});
                    }
                });
            }

        });
    }

});

module.exports = router;
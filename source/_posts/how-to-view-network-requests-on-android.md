---
layout: post
title: "如何在android上抓包"
description: ""
category: "android" 
date: 2014/3/21

tags: [tcpdump,抓包]
---


## 用Charles

**android4.0以上的系统，wifi环境下支持设置网络代理。**

- 安装[Charles](http://www.charlesproxy.com/)

- 打开Charles，在`proxy`-->`proxy settings`-->`proxies`中设置要监听的端口号，一般为**8080**

- 查看本机ip，

		$ ifconfig

- 记住本机的ip地址，如**222.11.22.11**
- 将android手机连上wifi，确保与电脑处于**同一**ip段。
- 一般在wifi连接的**高级设置**里可以找到**代理设置**，将代理设置改为**手动**，
  填入刚才记下的ip地址，以及Charles里设置的端口号**8080**，保存后退出。
  现在手机的网络请求都会被转发到Charles上。
  <!-- more -->

	![charles](/img/charles.png)

 这种方法只适合于抓去android4.0以上系统，wifi环境的网络请求。

 对于android2.x的系统，系统没有提供设置代理的方法。

 或者，我们需要查看 *2g* / *3g* / *4g* 的网络请求，用Chalers就无能为力了。

***

## 用tcpdump结合wireshark

**前提是手机要root过**

 [tcpdump](http://www.tcpdump.org)是一个开源跨平台的网络数据采集分析工具。

 详细用法参见[ggjucheng](http://www.cnblogs.com/ggjucheng/archive/2012/01/14/2322659.html)的博客。

- 首先下载[tcpdump](http://www.strazzere.com/android/tcpdump)

- 将**tcpdump** push到手机sd卡上

		$ adb push ./tcpdump /sdcard/tcpdump

- 用**rootExplorer**将**tcpdump**复制到*/system/xbin*目录下

- 获取root权限

		$ adb shell
		$ su

- 给**tcpdump**加上权限
	
		$ chmod 777 /system/xbin/tcpdump

- 然后就是执行**tcpdump**开始抓包了

		$ tcpdump -p -vv -s 0 -w /sdcard/cap.pcap

- 等收集到足够的数据包后**ctrl + c**停止抓包

- 把收集到的数据pull到本地

		$ adb pull /sdcard/cap.pcap ./

- 用**wireshark**打开**pcap**文件

	![wireshark](/img/wireshark.png)

---
layout: post
title: "android不同系统版本sd的挂载方式"
description: ""
category: "android" 
date: 2014/11/1

tags: [android, sdcard]
---


## 2.x系统

sd卡实际挂载位置


		/mnt/sdcard 


并建立了一个/sdcard的软链接指向/mnt/sdcard


		/sdcard/  --> /mnt/sdcard


**Android 2.2之后的版本允许将应用程序安装于SD卡**

当SD卡挂载于手机时，`/mnt/sdcard/.android_secure` 目录会被映射到`/mnt/asec` 目录和 `/mnt/secure` 目录。其中`/mnt/asec` 目录中主要是程序的安装目录，包括其执行文件和lib文件等；而`/mnt/secure` 目录中就存放程序加密后的档案。也就是说，在`/mnt`路径下看到的`/mnt/asec`目录和`/mnt/secure`目录并不是真正存在在手机内存里的，它们只是`/mnt/sdcard/.android_secure`目录的一个影像而已。也就是说`/mnt/sdcard/.android_secure` =`/mnt/secure` +`/mnt/asec`


 <!-- more -->
 

## 4.1 系统

- 有外置sd卡时，实际挂载位置：

		/storage/sdcard0  sdcard_r 组

	为了兼容2.x系统app，使旧的app能正确认出sd卡，将2.x时代的sd卡路径映射到`/storage/sdcard0`上

		/mnt/sdcard --> /storage/sdcard0  system组

		/sdcard/ --> /storage/sdcard0  root组

- 无外置sd卡时，将内部存储空间划分一部分，虚拟为sd卡挂载在：

		/storage/sdcard0  sdcard_rw组

	    // 兼容2.x系统app

		/mnt/sdcard -->  /storage/sdcard0 root组

		/sdcard/ --> /storage/sdcard0  root组


## 4.4.2 系统

sd卡实际挂载位置

		/mnt/shell/emulate/0


兼容2.x系统app，google居然将以前的sd卡挂载路径称为[legacy](http://translate.google.cn/?hl=en#en/zh-CN/legacy)，可见对历史包袱也是很头疼


		/storage/emulated/legacy  --> /mnt/shell/emulate/0

		/mnt/sdcard --> /storage/emulated/legacy

		/sdcard --> /storage/emulated/legacy

		/storage/sdcard0 --> /storage/emulated/legacy

## 参考
[http://stackoverflow.com/questions/23625104/storage-emulated-legacy-vs-storage-emulated-0-vs-data-data-myapp](http://stackoverflow.com/questions/23625104/storage-emulated-legacy-vs-storage-emulated-0-vs-data-data-myapp)
[http://www.miui.com/thread-863099-1-1.html](http://www.miui.com/thread-863099-1-1.html)


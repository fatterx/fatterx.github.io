---
layout: post
title: "Android Bitmap的一点研究"
description: ""
category: "android" 
date: 2014/4/11

tags: [canvas, bitmap]
---


android中的**Bitmap**与其他对象不同，不能通过`new Bitmap()`直接实例化.

查看源码，**Bitmap**的构造函数是*default*的，仅包内可见，实际是供**native**方法调用的。

**Bitmap**中实际保存数据的地方在**native**层，**java**层仅对**native**层方法进行封装、重载，

并提供一些状态的判断方法、属性的`set`、`get`方法。

**Bitmap**有`mNativaBitmap`属性，用来保存`nativeBitmap`的地址。

`mNativeBitmap`的地址在构造**Bitmap**时，由**native**方法直接传递进来。


####所以整个**Bitmap**可以认为在**java**层基本不怎么占内存，大部分内存占用都是在**native**层。

 <!-- more -->


### **Bitmap**自身提供了三类创建**Bitmap**的静态方法：



#### 1. 根据传入的`colors`数组，生成`bitmap`，`colors`数组就是每个像素点的颜色值ARGB


	createBitmap(int colors[], int offset, int stride, int width, int height, Config config);


最终调用**native**方法


	nativeCreate(int[] colors, int offset, int stride, int width. int height, int config.nativeInt, boolean false)


生成新的**Bitmap**


#### 2.  生成指定大小的空白**Bitmap**
	

	createBitmap(int width, int height, Config config)


同样最终会调用

	nativeCreate(int[] colors, int offset, int stride, int width. int height, int config.nativeInt, boolean false)

不过其中`color`数组为`null`


#### 3.  从源Bitmap中截取一部分，生成新的Bitmap，不对源bitmap修改

具体实现分两部分：
	
调用方法**（2）**生成新的空白bitmap

new 一个Canvas，将新生成的bitmap set到canvas里，通过canvas对bitmap进行裁剪等处理，然后返回bitmap
		

	Canvas canvas = new Canvas();
	canvas.setBitmap(bitmap);
	canvas.drawBitmap(sourceBitmap, srcRect, dstRectF, paint);
	canvas.setBitmap(null);  //将临时的canvas中的mBitmap置空，防止canvas拥有bitmap引用，无法被GC回收


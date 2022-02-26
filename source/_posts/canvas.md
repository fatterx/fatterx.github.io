---
layout: post
title: "canvas、bitmap、paint之间是什么关系"
description: ""
category: "android" 
date: 2014/4/13

tags: [canvas, bitmap, paint]
---


[官方文档](http://developer.android.com/reference/android/graphics/Canvas.html)翻译过来的解释：

要绘图，需要4个基本组件:

- Bitmap 保存像素的容器
- Canvas 执行绘图命令的宿主
- Rect/Path/text/Bitmap 要绘制的元素
- Paint 用什么样的方式绘制


android的**canvas**绘图，基于**skia**，想要了解**canvas**的绘图过程，需要对**canvas**和**skia**的源码有所了解。

查看Canvas源码，发现Canvas与Bitmap类似，都是对其native方法进行了封装。
 
 <!-- more -->
 
真正起绘图作用的是`mNativeCanvas`，保存有**nativeCanvas(SkCanvas)**的指针。

`mNativeCanvas`注释上指明

>  assigned in constructors or setBitmap, freed in finalizer

说明`mNativeCanvas(SkCanvas)`是在构造函数、或者`setBitmap`时分配的。

继续查看源码，发现`mNativeCanvas`是调用**native**方法



	initRaster(int nativeBitmapOrZero)


	
方法生成。

`initRaster`中的参数就是Canvas私有属性`mBitmap`的**nativeBitmap(SkBitmap)**的指针。

查看*frameworks/base/core/jni/android/graphics/*下的Canvas.cpp文件，

    static SkCanvas* initRaster(JNIEnv* env, jobject, SkBitmap* bitmap) {
		    return bitmap ? new SkCanvas(*bitmap) : new SkCanvas;
	}


发现如果指定了**SkBitmap**，`initRaster`会以指定的**SkBitmap**生成**SkCanvas**；

反之会生成默认的**SkCanvas**。

继续查看*android/external/skia/src/core/*下SkCanvas的源码，

默认构造函数


	SkCanvas::SkCanvas()
	: fMCStack(sizeof(MCRec), fMCRecStorage, sizeof(fMCRecStorage)) {
		inc_canvas();
		
		this->init(NULL);
	}

`init`方法调用`setDevice`方法，生成默认的**SkDevice**，而**SkDeveice**最终会生成默认的**SkBitmap**

### 总结

- Canvas的属性`mNativeCanvas(SkCanvas)`是根据`mBitmap`生成的，如果`mBitmap`不为空，

  则`mNativeCanvas`操作/修改的**SkBitmap**就是`mBitmap`；

  否则会操作/修改`mNativeCanvas`自己的**SkBitmap**.

- Canvas最终操作/修改的内存还是**Bitmap(SkBitmap)**中的数据.

- `Canvas(bitmap)` 与 `canvas.setBitmap(bitmap)`中的**bitmap**是Canvas的`mBitmap`，直接操作/修改的对象。

  `canvas.drawBitmap(bitmap)`中的**bitmap**是源**bitmap**，draw时，不对源**bitmap**进行写操作，

  而是写入到`mBitmap`或`mNativeCanvas`自己的**SkBitmap**中。

- 源码中指明Canvas最大绘图大小为**32766 * 32766**。超过这个大小会直接报错。



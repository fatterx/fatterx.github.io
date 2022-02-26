---
layout: post
title: "Drawable小研究"
description: ""
category: android 
date: 2014/4/13
tags: [drawable, bitmap]
---

Drawable，官方给出的解释是“*something that can be drawn*”，翻译过来就是可以被画的东西。

官方把“可以被画的东西”分为了7种形式:

- [Bitmap](../../11/bitmap) 最简单的“可以被画的东西”，可能是png，或jpg

- **Nine Patch** 俗称“.9”图，android自己扩展的一种png格式，可以自定义图像拉伸的信息

- **Shape** 用简单的绘图指令生成图片。如画矩形、圆形

- **Layers** 多个Drawable，按照层叠顺序组成的Drawable

- **States** Drawable的状态，如“focused”, “pressed”等

- **Levels** 可以更改level的Drawable，如进度条，电池进度

- **Scale** 可缩放的Drawable

 <!-- more -->


Drawable是所有XDrawable的父类，子类有AnimationDrawable、BitmapDrawable、ClipDrawable、
GradientDrawable、InsetDrawable、LayerDrawable、LevelListDrawable、NinePathDrawable、
PaintDrawable、PictureDrawble、RotateDrawable、ScaleDrawable、ShapeDrawable、StateListDrawable、
TransitionDrawable。

**所以，Drawable是对一类“可以被画”的事物的抽象，Bitmap是7种形式Drawable的其中一种，BitmapDrawable是对Bitmap封装的具体Drawable。**

Drawable定义了抽象方法`draw(Canvas)`，各子类根据自己具体特征，实现不同的draw方法。

Drawable可以通过静态方法`creatFromResourceStream`创建Bitmap，之后包装为BitmapDrawable，

也可以通过`createFromXmlInner`工厂方法，根据xml文件内容创建具体的Drawable子类。


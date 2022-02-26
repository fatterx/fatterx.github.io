---
layout: post
title: "对javascript中的Variable Object的理解"
description: ""
category: "javascript" 
date: 2014/11/1

tags: [javascript,vo,scope chain]
---

## Variable Object

在**ECMAScipt**中，通过变量对象**Variable Object (VO)**机制来存贮、访问变量variables。**VO**中包含了：


### 1.  variables (通过var 声明的变量)

### 2.  function declaration (函数声明)

### 3.  function formal parameters (函数行参)

**注**： 不包括function expression (函数表达式)。

 <!-- more -->

**Variable Object**在**Global Context**中等同于**Global Object**，在**Function Context**中称为**Activation Object (AO)**，
一般来讲，**Variable Object** / **Activation Object** 我们不能直接在外部访问到。

要访问某个变量**x**，首先在**x**所在**Function Context**中的**Variable Object**中查找，
若找不到，则在**x**所属**function**的**\[\[scope\]\]**属性中保存的**scope chain**中，
逐级向上查找，直至查找到**Global Object**，如果仍未找到则返回 **x** is not defined 。

我们所常见的`window`对象实际上是**Global Object**的引用，所以通过`var`在**Global Context**中声明的变量**x**，
可以通过**x**直接访问，也可通过`window.x`来间接访问，并且[通过`window.x`访问比直接访问要慢](http://www.cnblogs.com/TomXu/archive/2012/01/16/2309728.html#2296024) 。


		var a = "variable";
		b = "property";

		console.log(window.a);  // "variable"
		console.log(window.b); // "property"

		delete window.a;  // false
		console.log(window.a); // "variable"

		delete window.b; //true
		console.log(window.b);  //undefined;

在上面的例子中， 虽然都能通过`window.a`, `window.b`的形式来访问，看似都是`window`的属性，但是实质是不同的。

不使用`var`声明的”变量“，实际不是真正的变量，而是**Global Object**的属性，可以通过**delete** 关键字删除，而真正的变量拥有`DontDelete`属性，不能通过`delete`删除。

但值得注意的是，在firebug中，执行



		delete window.a;  //true
		delete window.b;  //true




返回值都是**true**，这是由于在eval context中，变量不会被添加`DontDelete`属性，firebug正是利用eval来执行我们在console中的代码，而在chrome，opera的console中则返回正确的**false**,**true**


## 参考
[http://dmitrysoshnikov.com/ecmascript/chapter-2-variable-object](http://dmitrysoshnikov.com/ecmascript/chapter-2-variable-object/)

迁移自旧博客[懒蜗牛](http://lwn.iteye.com/blog/1602643)

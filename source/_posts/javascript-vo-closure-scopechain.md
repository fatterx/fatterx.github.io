---
layout: post
title: "图解javascript中的变量对象、闭包、作用域链机理"
description: ""
category: "javascript"
date: 2014/11/02
tags: [vo, closure, scopechain]
---

## 什么是闭包

**javascript**中的**闭包**是一个强大而灵活的武器，搞清**闭包**，**作用域链**的作用机理，能让我更好的将**闭包**运用在我们的项目中。

[mozilla开发者中心的定义：](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures)

> Closures are functions that refer to independent (free) variables. 

> In other words, the function defined in the closure 'remembers' the environment in which it was created. 


我理解的**闭包**是一个**function**，并且具有访问不在**function**内部定义的变量的能力，如嵌套**function**中的子**function**可以访问到定义在父**function**中的变量，是一类语言（如**js**）的特性。

 <!-- more -->
 
## 闭包的应用

 
看一个闭包在**js** for循环中经典的应用：


```

function foo(){
	for(var i = 0; i<10; i++){
		(function(j){
			setTimeout(function(){
				console.log( "current i:" + j + "--" + new Date().getSeconds() + "s" );
			}, j * 1000);
		})(i);
    }
}

foo();

```


上面的代码改自*Pro JavaScript Techniques* 中用js控制css达到动画效果的部分。动画的高度/透明度是根据索引`i`的值动态设置的，所以我们需要将这个索引`i`保存下来。

## 闭包的错误使用


这里就有一个问题，为什么我们写成下面的代码就不能得到正确的索引呢？

```
function foo(){
	for(var i = 0; i<10; i++){
		setTimeout(function(){
				console.log("current i:"+i+"--"+new Date().getSeconds()+"s");     //这里也用到了闭包
		},i*1000);
    }
}

foo();
```

上面的代码得到的`i`始终是**10**，而不是想要的**1**,**2**,**3**...


现在我们来逐步详细分析原因:

-    1) 进入**foo**的**execution context**阶段：

这时创建**foo**的**Variable Object (VO)**/**Activation Object (AO）**


		VO(foo) = {
 			 i: undefined,
		};

-    2) foo代码执行阶段：

将**fooExecutionContext** push进**Execution Context Stack** 中，`i`随着循环被修改为相应的数值。


		executionContextStack.push(fooExecutionContext);

		executionContextStack = [ 
			<foo> functionContext,
			globalContext
		]


由于在`for`循环执行的时候，`setTimeout`内部的匿名函数的**execution context**对于**foo**来说是不可见的，因为这时的匿名函数并没有执行， 不能访问、修改该匿名函数内部的变量，所以匿名函数中的`i`不会被修改为`for`循环的当前索引。 但是该匿名函数的**Variable Object (VO)**/**Activation Object (AO)**已经创建，并且保存了`i`的**引用**。


`for`循环结束时`i`值为**10**， 正是由于匿名函数的**VO**/**AO**保存了`i`的**引用**，**foo**运行结束时，**Garbage Collector**不会销毁**foo**的**VO**/**AO**(上面保存着`i=10`),所以当`setTimeout`内的匿名函数运行时，`i`的值始终为**10**。


搞清楚了上面的问题后，现在我们用图来解释开始的例子。

![图1](/img/javascript_scopechain_pic_1.png)

上面的图是foo在执行最后一次循环时的运行机理。


![图2](/img/javascript_scopechain_pic_2.png)

图2是`setTimeout`内部匿名函数执行时的机理，其中红颜色框起来部分随每个`setTimeout`内部匿名函数的不同而不同。



通过上面两副图我们可以清楚的看到，增加的匿名自执行函数的作用就是将`for`循环的索引作为自己的局部变量保存起来，这样`setTimeout`里面的匿名函数就可以通过**scope chain**访问到正确的索引值了。



## 参考

[http://dmitrysoshnikov.com/ecmascript/javascript-the-core/](http://dmitrysoshnikov.com/ecmascript/javascript-the-core/)

[http://dmitrysoshnikov.com/ecmascript/chapter-1-execution-contexts/](http://dmitrysoshnikov.com/ecmascript/chapter-1-execution-contexts/)

[http://dmitrysoshnikov.com/ecmascript/chapter-2-variable-object/](http://dmitrysoshnikov.com/ecmascript/chapter-2-variable-object/)

[http://dmitrysoshnikov.com/ecmascript/chapter-4-scope-chain/](http://dmitrysoshnikov.com/ecmascript/chapter-4-scope-chain/)

迁移自旧博客[懒蜗牛](http://lwn.iteye.com/blog/1604548)

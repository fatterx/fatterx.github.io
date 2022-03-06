---
title: kotlin coroutine入门
date: 2022-02-28 10:04:12
category: "Kotlin"
tags: [kotlin,coroutine]
---

### 引言

客户端开发，无论是Android、iOS或是Windows，主线程（UI线程）需要及时相应用户的输入操作，才能保证用户滑动、移动鼠标时的流畅体验。
这要求主线程不能有占用CPU的耗时计算，或者IO等阻塞操作。

开发过程中为了避免UI线程被耗时操作阻塞，需要在异步线程执行耗时操作，然后通过callback通知UI线程刷新界面。一些复杂的页面需要嵌套很多层callback，造成了[callback hell](https://callbackhell.com/)。

callback的方案既不符合人类的直观思维方式，让代码也变得难以维护。

[RxJava](https://github.com/ReactiveX/RxJava)的诞生，通过观察/订阅的思路，结合链式调用，优雅的解决了callback hell的问题。

随着Kotlin在Android上的成功推广，如今异步任务有了更底层、更轻量的新方案：[Kotlin Coroutine](https://kotlinlang.org/docs/coroutines-basics.html)

### 什么是Coroutine

> 以下特指Kotlin Coroutine的概念

- coroutine：
广义上，一种并发设计，通过执行一段可被挂起（调用suspend方法），恢复(suspend方法执行完毕)的代码，简化并发逻辑。
狭义上，Coroutine对象可以近似认为是支持了start、resume、cancel的Runnable对象，Kotlin的Coroutine类实现了Job接口。

- suspend方法：
被suspend关键字修饰的方法，**提示**当前方法可能阻塞调用方。只能在CoroutineScope 或其他suspend方法中调用。

- 怎么挂起？
调用suspend方法。

- 怎么恢复？
编译器一个人默默扛下了所有。在编译阶段，会把suspend之后的代码块封装为Continuation作为参数注入原suspend方法，以实现resume能力。
相当于编译器自动为我们生成了callback。

- 运行到suspend方法（挂起）时当前线程是什么状态？
Running状态，继续运行调用suspend方法之外的代码。

### 如何使用Coroutine

举个例子🌰：

- launch
创建一个新的coroutine并执行，**不关心返回值**

```kotlin
fun main() = runBlocking { // this: CoroutineScope
    launch { // launch a new coroutine and continue
        delay(1000L) // non-blocking delay for 1 second (default time unit is ms)
        println("World!") // print after delay
    }
    println("Hello") // main coroutine continues while a previous one is delayed
}
```

- async
  
```kotlin
fun main() = runBlocking {
    val retDefer = async {
          delay(1000L)
          "from async return"  
    }

    val ret = retDefer.await()

    println(ret) // "from async return"
}
```

创建新的coroutine并执行，**关心返回值**

![launch vs async](/medias/images/launch_vs_async.png)

#### Structured Concurrency

结构化并发，coroutine不同于Thread，有层级结构。

Java中的Thread只有Group的概念，没有父子关系，所有的线程都是同一级的，是兄弟关系。一个线程的死活、异常，不影响别的线程。

coroutine是有父子概念的，父coroutine被cancel，子的coroutine也会被cancel（如果正确的实现）。子coroutine如果有异常，会传播给父coroutine，
进而影响其他兄弟coroutine的执行。

Kotlin Coroutine遵循Structured Concurrency设计规范，通过Scope可以跟踪每个corouine的执行，确保不会泄露、丢失。

#### Context

一个Set，保存了coroutine的基础信息：

- CoroutineDispatcher 协程运行的Dispatcher（线程）
- CoroutineExceptionHandler 异常后的处理方法
- CoroutineName 协程的名字
- Job 协程本体

![coroutineContext](/medias/images/coroutine_context.png)

#### Dispatcher

控制coroutine运行的线程，实现线程的切换。

- Dispatcher.Main 主线程，UI线程
- Dispatcher.IO IO线程池，2个core线程，最大线程数max(64, cpu cores)
- Dispatcher.Default 默认线程池，最大线程数为CPU核数

#### Job

协程本体，增强版的Runnable。有start、cancel、resume的能力。通常情况下，如果单个Job发生异常，会传播给父Job，导致其他兄弟Job被cancel。
![Job When Exception](/medias/images/job_when_exception.png)

**SupervisorJob**可以把异常控制在自己的范围呢
![SupervisorJob](/medias/images/supervisor_job.png)

#### Scope
  
协程的作用域。往往Scope内会有多个coroutine执行，scope用来统一跟踪、管理每个coroutine，控制corountine的生命周期，包括子coroutine。

Scope持有Context

- 创建coroutine
  Corotine的构造函数都是未开放的，只能通过scope的launch/async扩展方法创建。launch方法返回Job对象，async方法返回Deferred对象，可控制单个coroutine的生命周期

- 异常处理
  exceptionHandler，处理方法类似Thread.uncaughtExceptionHandler

- 取消  
  scope.cancel()，取消当前scope下的所有coroutine。
  注意：kotlinx.coroutines包下的所有suspend方法都是可以被cancel的，但如果有自定义的suspend方法，需要通过协作的方式才能被cancel掉。
  如调用`ensureActive()`方法：

```kotlin
    suspend fun mySuspendFunc() {
        for(file in files) {
            ensureActive() // check point
            file.readText()
        }
    }
```

- 常用的Scope：
  - ViewModelScope
    AndroidX中ViewModel扩展属性，ViewModel clear时自动cancel。默认运行在主线程
  - LifecycleScope
    AndroidX中LifecycleOwner扩展属性，LifecyleOwner Destroy时，自动cancel。提供了`launchWhenCreated`、`launchWhenResumed`、`launchWhenStarted`的便利方法
  - GlobalScope
    全局Scope，慎用，需要自己关注生命周期，防止coroutine泄露

#### 参考

- [Coroutines Basics](https://kotlinlang.org/docs/coroutines-basics.html)
- [Kotlin Coroutines 101 - Android Conference Talks](https://www.youtube.com/watch?v=ZTDXo0-SKuU&list=PLWz5rJ2EKKc-DpJGklgEE_w3kTO847Uxx)
- [Suspend functions - Kotlin Vocabulary](https://www.youtube.com/watch?v=IQf-vtIC-Uc&list=PLWz5rJ2EKKc-DpJGklgEE_w3kTO847Uxx&index=2)
- [Android Code-Along: Kotlin coroutines](https://www.youtube.com/watch?v=FWxeDqM_WIU)
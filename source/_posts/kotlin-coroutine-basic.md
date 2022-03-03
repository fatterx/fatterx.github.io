---
title: kotlin coroutine基本概念
date: 2022-02-28 10:04:12
category: "Kotlin"
tags: [kotlin,coroutine]
---

客户端开发，无论是Android、iOS或是Windows，主线程（UI线程）需要及时相应用户的输入操作，
才能保证用户滑动、移动鼠标时的流畅体验。
这要求主线程不能有占用CPU的耗时计算，或者IO等阻塞操作。


Android开发从开始的AsyncTask、Handler，为了避免UI线程被block
需要各种callback，有时需要嵌套很多层，这样的代码既理解又难以维护。

RxJava的诞生，通过链式调用，解决了callback hell的问题。

如今异步任务有了更轻量的新方案：Coroutine


## Structured Concurrency

## Scope

## Context

## Dispatcher

## Job
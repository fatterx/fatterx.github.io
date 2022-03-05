---
title: 为何加载So时会发生死锁？
date: 2022-03-04 16:43:16
category: "Android"
tags: [dead lock, 死锁, anr]
cover: true
---

### 问题描述

最近项目中遇到一个神奇的ANR问题，量级比较大，都是卡在同一个地方。

初看日志是主线程卡在了Webview加载So的地方。

```java
[MainThread]

ANR_EXCEPTION:
java.lang.Runtime.loadLibrary0(Unknown Source:0)
java.lang.Runtime.loadLibrary0(Runtime.java:1008)
java.lang.System.loadLibrary(System.java:1665)
sl.m(chromium-TrichromeWebView.apk-stable-410310633:15)
sl.i(chromium-TrichromeWebView.apk-stable-410310633:11)
sl.k(chromium-TrichromeWebView.apk-stable-410310633:5)
org.chromium.android_webview.AwBrowserProcess.i(chromium-TrichromeWebView.apk-stable-410310633:10)
com.android.webview.chromium.WebViewChromiumFactoryProvider.f(chromium-TrichromeWebView.apk-stable-410310633:71)
com.android.webview.chromium.WebViewChromiumFactoryProvider.<init>(chromium-TrichromeWebView.apk-stable-410310633:12)
com.android.webview.chromium.WebViewChromiumFactoryProviderForR.<init>(chromium-TrichromeWebView.apk-stable-410310633:1)
com.android.webview.chromium.WebViewChromiumFactoryProviderForR.create(chromium-TrichromeWebView.apk-stable-410310633:1)
java.lang.reflect.Method.invoke(Native Method)
android.webkit.WebViewFactory.getProvider(WebViewFactory.java:266)
android.webkit.CookieManager.getInstance(CookieManager.java:50)
android.webkit.CookieManager.allowFileSchemeCookies(CookieManager.java:259)
```

### 问题分析

为什么加载So会这么耗时？这个So有什么特殊的？莫非这个So加载超过了5秒？

查看此时运行的其他线程，发现同时被卡住的，不止webview一个So加载的地方，如下所示
端内几乎加载So的线程都卡住了。

```java
[Thread-A]

java.lang.Runtime.loadLibrary0(Unknown Source:0)
java.lang.Runtime.loadLibrary0(Runtime.java:1008)
java.lang.System.loadLibrary(System.java:1665)
yo0.j.ʿ(SafelyLibraryLoader.java:2)
com.xxx.yyy.common.soloader.SoLoaderShim.loadLibrary(SoLoaderShim.java:1)

[Thread-B]
java.lang.Runtime.nativeLoad(Native Method)
java.lang.Runtime.nativeLoad(Runtime.java:1131)
java.lang.Runtime.loadLibrary0(Runtime.java:1085)
java.lang.Runtime.loadLibrary0(Runtime.java:1008)
java.lang.System.loadLibrary(System.java:1665)
xt0.c.ʻ(LibLoadUtil.java:1)
xt0.c.ʼ(LibLoadUtil.java:3)
wt0.d.ʼ(StarTrailHelper.java:4)


[Thread-C]
java.lang.Runtime.loadLibrary0(Unknown Source:0)
java.lang.Runtime.loadLibrary0(Runtime.java:1008)
java.lang.System.loadLibrary(System.java:1665)
com.xxx.yyy.est.E.<clinit>(Unknown Source:2)
com.xxx.yyy.est.E.c(Unknown Source:0)
com.xxx.yyy.T.q(T.java:2)
```

看现象很像是发生了死锁，不过死锁发生的场景是两个线程相互等待对方持有的锁🔒。
排查主线程调用堆栈后，发现除了系统`Runtime.loadiLibrary0`方法加了锁，其他地方没有锁。

`Runtime`本身是单例，`loadLirary0`方法是**synchronized**方法，要进入该方法，需要当前线程获取到`Runtime`对象的锁🔒。
查看整个`Runtime`类中，能竞争`Runtime`对象锁的，都是在加载So相关的逻辑

```java
    private synchronized void loadLibrary0(ClassLoader loader, Class<?> callerClass, String libname) {
        if (loader != null && !(loader instanceof BootClassLoader)) {
            String filename = loader.findLibrary(libraryName);
            if (filename == null) {
                throw new UnsatisfiedLinkError(loader + " couldn't find \"" +
                                               System.mapLibraryName(libraryName) + "\"");
            }
            String error = nativeLoad(filename, loader);
            if (error != null) {
                throw new UnsatisfiedLinkError(error);
            }
            return;
        }

        getLibPaths();
        String filename = System.mapLibraryName(libraryName);
        String error = nativeLoad(filename, loader, callerClass);
        if (error != null) {
            throw new UnsatisfiedLinkError(error);
        }
    }
```

#### 排查过程

所以问题变成了，是谁持有了`Runtime`加载So的对象锁🔒，并且长时间没有释放。

通过分析所有被卡在加载So处的线程，发现线程**Thread B**嫌疑重大

```java
[Thread B]
java.lang.Runtime.nativeLoad(Runtime.java:1131)
java.lang.Runtime.loadLibrary0(Runtime.java:1085)
java.lang.Runtime.loadLibrary0(Runtime.java:1008)
java.lang.System.loadLibrary(System.java:1665)
xt0.c.ʻ(LibLoadUtil.java:1)
xt0.c.ʼ(LibLoadUtil.java:3)
wt0.d.ʼ(XXXXHelper.java:4)
```

只有它成功获取到了`Runtime`加载So的锁，并进入了native方法开始加载So。

看堆栈信息，线程**Thread B**是正在加载So，而其他线程还在等待**Thread B**加载So成功后重新竞争`Runtime`的对象锁🔒。

但是为什么**Thread B**也被阻塞住，没有完成So的加载，它在等什么？

有没有可能是这个So在`JNI_OnLoad`方法里执行了什么耗时操作？

通过联系**Thread B**加载So的维护团队，对方表示，`JNI_OnLoad`内没有耗时操作，只是一些常规的`JNI`方法注册和初始化工作。

然而诡异的是这个Sdk已经上线了好几个版本，最近没有更新。通过反编译Apk，比对So的md5，发现确实没有变化。

线索到这里又中断了，没有了头绪。

- 猜想A

如果`JNI_Onload`里反射调用了其他的类，而在这个类的`static`块中又触发了新的So加载，会不会死锁？

答案是不会。

因为即是在`JNI_Onload`里触发了新的So加载，也是在当前线程，**synchronize**锁是可重入锁，当前线程已经持有了`Runtime`对象的锁，
再次进入`Runtime.loadLibrary0`方法无需再与其他线程竞争，所以不会发生死锁。

跟So的维护团队也确认，在`JNI_Onload`里不会触发新的So加载。

- 猜想B

既然`JNI_Onload`里不会加载So，那会初始化其他类吗？
类初始化也是有锁的，虚拟机为了保证每个类只被初始化一次，在类初始化时会加锁。

如果

1. 线程**Thread C**正在初始化类**ClassA**，恰好**ClassA**的**static**块中触发了So的加载
2. 线程**Thread B**的`JNI_Onload`方法里触发了**ClassA**的类初始化

此时，线程**Thread C**持有虚拟机的类加载锁，等待`Runtime`的对象锁；线程**Thread B**持有`Runtime`的**对象锁**，等待虚拟机的**类加载锁**，便发生了死锁。

感觉看到了一丝希望。

再回头分析ANR的堆栈信息，发现**Thread C**确实正处于类初始化的阶段，并且也正被阻塞在So的加载。

```java
[Thread-C]
java.lang.Runtime.loadLibrary0(Unknown Source:0)
java.lang.Runtime.loadLibrary0(Runtime.java:1008)
java.lang.System.loadLibrary(System.java:1665)
**com.xxx.yyy.est.E.<clinit>(Unknown Source:2)**
com.xxx.yyy.est.E.c(Unknown Source:0)
com.xxx.yyy.T.q(T.java:2)
```

高亮的第四行，**com.xxx.yyy.est.E.<clinit>(Unknown Source:2)**，说明正在进行类的初始化。

种种迹象表明，很有可能是发生了**猜想B**的情况。

即线程**Thread B**与**Thread C**发生了死锁，同时由于`Runtime`加载So的锁被**Thread B**持有，导致包括主现场在内的端内所有加载So的线程都被阻塞，
进而导致了ANR。

#### 水落石出

由于这个问题量级比较大，经过与厂商的沟通，拿到了线上一些日志。

```log

Thread B
    #00 pc 000000000006cbbc  /apex/com.android.runtime/lib64/bionic/libc.so (syscall+28) (BuildId: b91c775ccc9b0556e91bc575a2511cd0)
    #01 pc 000000000015c2a0  /apex/com.android.runtime/lib64/libart.so (art::ConditionVariable::WaitHoldingLocks(art::Thread*)+156) (BuildId: 08543716770b195bd10fafbe11bb5052)
    #02 pc 00000000004292e4  /apex/com.android.runtime/lib64/libart.so (art::Monitor::Wait(art::Thread*, long, int, bool, art::ThreadState)+660) (BuildId: 08543716770b195bd10fafbe11bb5052)
    #03 pc 000000000042af90  /apex/com.android.runtime/lib64/libart.so (art::Monitor::Wait(art::Thread*, art::ObjPtr<art::mirror::Object>, long, int, bool, art::ThreadState)+284) (BuildId: 08543716770b195bd10fafbe11bb5052)
    #04 pc 0000000000184ef0  /apex/com.android.runtime/lib64/libart.so (art::ClassLinker::WaitForInitializeClass(art::Handle<art::mirror::Class>, art::Thread*, art::ObjectLock<art::mirror::Class>&)+160) (BuildId: 08543716770b195bd10fafbe11bb5052)
    #05 pc 00000000001840bc  /apex/com.android.runtime/lib64/libart.so (art::ClassLinker::InitializeClass(art::Thread*, art::Handle<art::mirror::Class>, bool, bool)+2552) (BuildId: 08543716770b195bd10fafbe11bb5052)
    #06 pc 000000000016e9a4  /apex/com.android.runtime/lib64/libart.so (art::ClassLinker::EnsureInitialized(art::Thread*, art::Handle<art::mirror::Class>, bool, bool)+92) (BuildId: 08543716770b195bd10fafbe11bb5052)
    #07 pc 00000000003fc280  /apex/com.android.runtime/lib64/libart.so (art::FindMethodID(art::ScopedObjectAccess&, _jclass*, char const*, char const*, bool)+548) (BuildId: 08543716770b195bd10fafbe11bb5052)
    #08 pc 00000000003ca048  /apex/com.android.runtime/lib64/libart.so (art::JNI::GetStaticMethodID(_JNIEnv*, _jclass*, char const*, char const*)+680) (BuildId: 08543716770b195bd10fafbe11bb5052)
    #09 pc 00000000000136f4  /data/app/com.xxx.yyys-0FVA4L2VSdb5GXWYPpaZFA==/lib/arm64/libest.so (entry_est+1284) (BuildId: feb2c1dcd5b5117d0e451dacb4be53ceb1a3c5fe)
    #10 pc 000000000000dffc  /data/app/com.xxx.yyys-0FVA4L2VSdb5GXWYPpaZFA==/lib/arm64/libest.so (JNI_OnLoad+160) (BuildId: feb2c1dcd5b5117d0e451dacb4be53ceb1a3c5fe)
    #11 pc 000000000039726c  /apex/com.android.runtime/lib64/libart.so (art::JavaVMExt::LoadNativeLibrary(_JNIEnv*, std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char>> const&, _jobject*, _jclass*, std::__1::basic_string<char, std::__1::char_traits<char>, std::__1::allocator<char>>*)+3412) (BuildId: 08543716770b195bd10fafbe11bb5052)
    #12 pc 0000000000005174  /apex/com.android.runtime/lib64/libopenjdkjvm.so (JVM_NativeLoad+552) (BuildId: 32291dbf2a17e91f03e5b077fb50c9fe)
    #13 pc 00000000000efaf4  /system/framework/arm64/boot.oat (art_jni_trampoline+228) (BuildId: 8fb9eb57b3ea725573d56f165d17f78dd54965d7)
    #14 pc 0000000000110a5c  /system/framework/arm64/boot.oat (java.lang.Runtime.loadLibrary0+236) (BuildId: 8fb9eb57b3ea725573d56f165d17f78dd54965d7)
    #15 pc 0000000000112164  /system/framework/arm64/boot.oat (java.lang.Runtime.loadLibrary0+180) (BuildId: 8fb9eb57b3ea725573d56f165d17f78dd54965d7)
    #16 pc 0000000000117b20  /system/framework/arm64/boot.oat (java.lang.System.loadLibrary+96) (BuildId: 8fb9eb57b3ea725573d56f165d17f78dd54965d7)
    #17 pc 00000000016f1fc4  /data/app/com.xxx.yyys-0FVA4L2VSdb5GXWYPpaZFA==/oat/arm64/base.odex (or0.c.ʻ+116)


Thread C
    #00 pc 000000000006cbbc  /apex/com.android.runtime/lib64/bionic/libc.so (syscall+28) (BuildId: b91c775ccc9b0556e91bc575a2511cd0)
    #01 pc 000000000015c2a0  /apex/com.android.runtime/lib64/libart.so (art::ConditionVariable::WaitHoldingLocks(art::Thread*)+156) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #02 pc 000000000015dfb8  /apex/com.android.runtime/lib64/libart.so (art::PiConditionVariable::WaitHoldingLocks(art::Thread*)+260) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #03 pc 0000000000424f44  /apex/com.android.runtime/lib64/libart.so (_ZN3art7Monitor4LockILNS_10LockReasonE1EEEvPNS_6ThreadE+1928) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #04 pc 000000000042aaf0  /apex/com.android.runtime/lib64/libart.so (art::Monitor::MonitorEnter(art::Thread*, art::ObjPtr<art::mirror::Object>, bool)+976) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #05 pc 00000000005bb010  /apex/com.android.runtime/lib64/libart.so (artLockObjectFromCode+32) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #06 pc 00000000001477e4  /apex/com.android.runtime/lib64/libart.so (art_quick_lock_object_no_inline+52) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #07 pc 00000000001109bc  /system/framework/arm64/boot.oat (java.lang.Runtime.loadLibrary0+76) (BuildId: c6616f9f679ad7292beda02de1246df662f7f266)
    #08 pc 0000000000112164  /system/framework/arm64/boot.oat (java.lang.Runtime.loadLibrary0+180) (BuildId: c6616f9f679ad7292beda02de1246df662f7f266)
    #09 pc 0000000000117b20  /system/framework/arm64/boot.oat (java.lang.System.loadLibrary+96) (BuildId: c6616f9f679ad7292beda02de1246df662f7f266)
    #10 pc 00000000001475b8  /apex/com.android.runtime/lib64/libart.so (art_quick_invoke_static_stub+568) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #11 pc 00000000001561d4  /apex/com.android.runtime/lib64/libart.so (art::ArtMethod::Invoke(art::Thread*, unsigned int*, unsigned int, art::JValue*, char const*)+284) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #12 pc 00000000002fd900  /apex/com.android.runtime/lib64/libart.so (art::interpreter::ArtInterpreterToCompiledCodeBridge(art::Thread*, art::ArtMethod*, art::ShadowFrame*, unsigned short, art::JValue*)+384) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #13 pc 00000000002f8bd0  /apex/com.android.runtime/lib64/libart.so (bool art::interpreter::DoCall<false, false>(art::ArtMethod*, art::Thread*, art::ShadowFrame&, art::Instruction const*, unsigned short, art::JValue*)+912) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #14 pc 00000000005ce108  /apex/com.android.runtime/lib64/libart.so (MterpInvokeStatic+368) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #15 pc 0000000000141994  /apex/com.android.runtime/lib64/libart.so (mterp_op_invoke_static+20) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #16 pc 00000000020f1494  /data/app/com.xxx.yyy-O_XmVEkRKPw5wrtfpQ3R2w==/oat/arm64/base.vdex (com.xxx.yyy.est.E.<clinit>+4)
    #17 pc 00000000002ce22c  /apex/com.android.runtime/lib64/libart.so (_ZN3art11interpreterL7ExecuteEPNS_6ThreadERKNS_20CodeItemDataAccessorERNS_11ShadowFrameENS_6JValueEbb.llvm.10887373532384510885+320) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #18 pc 00000000005bc090  /apex/com.android.runtime/lib64/libart.so (artQuickToInterpreterBridge+1012) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #19 pc 0000000000150468  /apex/com.android.runtime/lib64/libart.so (art_quick_to_interpreter_bridge+88) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #20 pc 00000000001475b8  /apex/com.android.runtime/lib64/libart.so (art_quick_invoke_static_stub+568) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #21 pc 00000000001561d4  /apex/com.android.runtime/lib64/libart.so (art::ArtMethod::Invoke(art::Thread*, unsigned int*, unsigned int, art::JValue*, char const*)+284) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #22 pc 0000000000183e70  /apex/com.android.runtime/lib64/libart.so (art::ClassLinker::InitializeClass(art::Thread*, art::Handle<art::mirror::Class>, bool, bool)+1964) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #23 pc 000000000016e9a4  /apex/com.android.runtime/lib64/libart.so (art::ClassLinker::EnsureInitialized(art::Thread*, art::Handle<art::mirror::Class>, bool, bool)+92) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #24 pc 00000000005bf8dc  /apex/com.android.runtime/lib64/libart.so (artQuickResolutionTrampoline+3140) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #25 pc 00000000001501e8  /apex/com.android.runtime/lib64/libart.so (art_quick_resolution_trampoline+88) (BuildId: 691979e9d66dfedf3fd32d27da323a02)
    #26 pc 0000000000cc7d6c  /data/app/com.xxx.yyy-O_XmVEkRKPw5wrtfpQ3R2w==/oat/arm64/base.odex (com.xxx.yyy.T.q+316)

```

通过日志，可以很显示看到发生死锁的地方，与猜测B一致，至此线上量级Top 1的ANR问题终于水落石出。

### 解决方案

定位到问题后，解决方案就很简单了，联系对方Sdk团队，调整So的加载策略：

- 避免在类的**static**块中加载So，可单独放在init方法中
- 避免在So的`JNI_OnLoad`中执行触发类初始化的操作
  
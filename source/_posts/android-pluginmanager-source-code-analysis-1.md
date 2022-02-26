---
layout: post
title: "Android PluginManager 源码解析1--PluginManager"
category: "android" 
date: 2015/08/09
tags: [插件, 反射, ClassLoader]

---

## Android PluginManager简介


**Android pluginManager**是[HouKangxi](https://github.com/houkx/)大神开发的一个android插件化开发框架，可以动态的加载apk，实现组件的热插拔。

项目地址：[https://github.com/houkx/android-pluginmgr]()

相比于其他的插件化解决方案，**Android pluginManager**主要优势是采用了动态代理技术，自动为插件生成代理activity，插件apk基本无需做任何更改。


### 实现的功能点：

- 插件为普通apk，无须依赖任何jar(摘自[作者的博客](http://blog.csdn.net/hkxxx/article/details/42194387))
- Activity生命周期由系统自己管理
- 使用简单，只需要了解一个类PluginManager的两个方法
- 启动Activity的效率高
- 不修改插件，被加载的插件仍然可以独立安装。
- 可加载任意apk中的 Activity (包括子类 ActionBarActivity 、FragmentActivity)的派生类(不包括违反限制条件的Activity)
- 支持插件自定义Application
- 支持插件Apk中的Activity跳转到别的Activity(插件内部的或系统的,外部已安装apk的，甚至是别的插件中的),也没有任何限制
- 支持Activity设置主题(与系统的主题应用规则一样，如果Activity没指定Theme,但所在Application指定了Theme，则使用Application的Theme)
- 初步支持.so
- 支持插件使用 SharedPreference 或 SQLite数据库(尚未完善)

<!-- more -->

### 尚未完成的部分：

- 目前还不支持service、content provider

### 一些限制：

- 插件中的权限，无法动态注册，插件中的权限都得在宿主中注册
- 不支持多进程
- Manifest中注册的activity的目前只能使用一种launchMode，
要支持singleTask等多种launchMode，需要自己维护activity栈来模拟。

### 动态加载apk的思路：

就目前自己了解的情况来看，动态加载apk，一般是通过DexClassLoader，加载apk中的Activity。

此时调起的Activity是普通的Java对象，没有了onCreate() 、onStart ()、onResume()、onPause()、onStop()、onDestory()等生命周期。

为解决这个问题，一般都会在宿主中有一个ProxyActivity，它是一个真实的Activity，由系统管理它的生命周期。

ProxyActivity持有一个插件的Activity的引用，当系统触发ProxyActivity的生命周期时，ProxyActivity通知插件的Activity来模拟正常Activity的生命周期。

ProxyActivity通知插件的Activity方式分为两种：
- 直接通过反射调用插件Activity的生命周期方法。效率较低
- 插件Activity继承一个BasePluginActivity或者实现一个PluginInterface。对插件浸入性较大，需要改动较多代码。

其中一个难点是插件资源文件的访问。

由于Activity变成了普通的Java对象，没有了Context，不能通过getResources()直接访问插件中的资源。
解决方案有几种：
- 把插件的资源复制到宿主中，向插件注入宿主的Context
- 把插件的资源解压到sd卡某路径下，以流的形式读取，自己解析
- 修改AssetManager，把插件的路径添加到AssetManager中



## PluginManager初始化

- ### 获取application Context

PluginManager是一个单例，在初始化时将宿主（host）application Context 作为PluginManager的Context

``` java
        Context ctx = context.getApplicationContext();
        synchronized (PluginManager.class) {
            instance.init(ctx);
        }
```

- ### 创建plugins目录

在`dexInternalStoragePath`目录下保存插件的原apk文件，及动态生成的新的dex文件

``` java
        dexInternalStoragePath = context
                .getDir("plugins", Context.MODE_PRIVATE);
        dexInternalStoragePath.mkdirs();
```

- ### 创建pluginouts目录

在`dexOutputPath`目录下保存插件的原dex文件

``` java
        File optimizedDexPath = ctx.getDir("plugsout", Context.MODE_PRIVATE);
        if (!optimizedDexPath.exists()) {
            optimizedDexPath.mkdirs();
        }
        dexOutputPath = optimizedDexPath.getAbsolutePath();
     ```

- ### 替换classLoader

把宿主 application context 的`classLoader`通过反射替换为自定义的classLoader FrameworkClassLoader.

``` java
		try {
            Object mPackageInfo = ReflectionUtils.getFieldValue(ctx,
                    "mBase.mPackageInfo", true);
            frameworkClassLoader = new FrameworkClassLoader(
                    ctx.getClassLoader());
            // set Application's classLoader to FrameworkClassLoader
            ReflectionUtils.setFieldValue(mPackageInfo, "mClassLoader",
                    frameworkClassLoader, true);
        } catch (Exception e) {
            e.printStackTrace();
        }
```

## 加载插件

- ### 生成PluginInfo 对象保存插件信息

把生成的PluginInfo对象保存Map中缓存，记录当前加载的插件。这里保存PluginInfo时需要在调用插件的地方为插件传入一个id，如果id为null，则默认使用插件的包命作为插件id。

会同时保持在`pluginIdToInfoMap`，`pluginPkgToInfoMap` 两个map中，此处有冗余的嫌疑。

``` java
        PlugInfo info = new PlugInfo();
        info.setId(pluginId == null ? pluginApk.getName() : pluginId);
        ...

        pluginPkgToInfoMap.put(plugInfo.getPackageName(), plugInfo);
        pluginIdToInfoMap.put(plugInfo.getId(), plugInfo);
    
```
      
- ### copy插件apk文件到`dexInternalStoragePath`目录下 



``` java
        File privateFile = new File(dexInternalStoragePath,
                targetFileName == null ? pluginApk.getName() : targetFileName);

        info.setFilePath(privateFile.getAbsolutePath());

        if (!pluginApk.getAbsolutePath().equals(privateFile.getAbsolutePath())) {
            copyApkToPrivatePath(pluginApk, privateFile);
        }
```

      
- ### 解析插件manifest.xml中的信息


``` java
    String dexPath = privateFile.getAbsolutePath();
    PluginManifestUtil.setManifestInfo(context, dexPath, info); 
```
 处理过程比较复杂，之后再分析
 
 
- ### 生成自定义ClassLoader备用


`PluginClassLoader`继承自`DexClassLoader`，以`FramworkClassLoader`作为parent ClassLoader，把生成的`pluginClassLoader`保存在`pluginInfo`中


``` java
        PluginClassLoader loader = new PluginClassLoader(dexPath, dexOutputPath, frameworkClassLoader, info);
        info.setClassLoader(loader);
```

自定义的`PluginClassLoader`会在之后的`FrameworkClassLoader` `loadClass`时用到。

`FrameworkClassLoader`的`loadClass`方法是Android PluginManager的核心方法，根据需要选择不同的classLoader来加载类文件。当需要加载插件中的类时，便委托给`PluginClassLoader`。

`PluginClassLoader`由于继承自`DexClassLoader` ，所以可以直接加载apk中的类文件，从而实现插件化的能力。


- ### 修改AssetManager加载资源的位置


现在已经能加载apk中的类文件了，但是还不能直接访问apk中的资源文件。

平常通过`Context.getString()`、`Context.getDrawable()`访问res中的资源文件，其实是委托给`Resources`处理的，所以要使插件能正确读取资源文件，需要从`Resources`入手。

继续分析`Resources`，发现`Resources.getString()`、`Resources.getDrawable()`等又是委托给`AssetManager`的`getResourceValue()`方法读取res下的资源。

```java

    public Drawable getDrawable(int id, @Nullable Theme theme) throws NotFoundException {
        TypedValue value;
        ...
        
        // 通过getValue从res中读取数据
        getValue(id, value, true);
        
        // 把typedValue中的数据转为Drawable
        final Drawable res = loadDrawable(value, id, theme);
        ...
        return res;
    }
    
    public void getValue(int id, TypedValue outValue, boolean resolveRefs)
            throws NotFoundException {
        ...
        // 委托给assetManager读取资源，把资源元数据保存在typedValue中
        mAssets.getResourceValue(id, 0, outValue, resolveRefs);
        
       ...
    }

```

并且`Resources`对象是`ResourcesManager.getTopLevelResources()`通过`AssertManager`生成的。

```java
            
    public Resources getTopLevelResources(String resDir, String[] splitResDirs,
            String[] overlayDirs, String[] libDirs, int displayId,
            Configuration overrideConfiguration, CompatibilityInfo compatInfo, IBinder token) {
            ...
       AssetManager assets = new AssetManager();
        
        if (resDir != null) {
            if (assets.addAssetPath(resDir) == 0) {
                return null;
            }
        }
        
        ...
        r = new Resources(assets, dm, config, compatInfo, token);
        ...
        
        return r;
 ｝
```

所以看起来只要搞定了`AssetManager`，就能顺利使插件访问到正确的资源文件了。

继续分析`AssetManager`，幸运的是`AssetManager`提供了一个`addAssetPath()`方法，可以直接读取zip文件中的资源。

```java
    /**
     * Add an additional set of assets to the asset manager.  This can be
     * either a directory or ZIP file.  Not for use by applications.  Returns
     * the cookie of the added asset, or 0 on failure.
     * {@hide}
     */
    public final int addAssetPath(String path) {
        synchronized (this) {
            int res = addAssetPathNative(path);
            makeStringBlocks(mStringBlocks);
            return res;
        }
    }
```


所以我们把插件apk的路径添加到assetpath中，之后生成的代理activity就能访问到插件中的资源文件。

我们需要生成一个`AssetManager`，并把插件apk的路径添加进`AssetManager`中。

`AssetManager`并不能直接new出来，`addAssetPath()`方法也不能直接方法，但是都可以同反射解决。


```java
        try {
            AssetManager am = (AssetManager) AssetManager.class.newInstance();
            am.getClass().getMethod("addAssetPath", String.class)
                    .invoke(am, dexPath);
            info.setAssetManager(am);
            Resources ctxres = context.getResources();
            Resources res = new Resources(am, ctxres.getDisplayMetrics(),
                    ctxres.getConfiguration());
            info.setResources(res);
        } catch (Exception e) {
            e.printStackTrace();
        }
```

这样便可以访问插件中的资源了。

- ### 初始化插件的application

同样是通过反射，用之前通过
```
    PluginManifestUtil.setManifestInfo(context, dexPath, info); 
```
方法获取保存在`PlugInfo`里的插件Application类名，实例化插件的application。


```java
                ClassLoader loader = plugin.getClassLoader();
                try {
                    Class<?> applicationClass = loader.loadClass(className);
                    Application application = (Application) applicationClass
                            .newInstance();
                    setApplicationBase(plugin, application);
                    // invoke plugin application's onCreate()
                    application.onCreate();
                } catch (Throwable e) {
                    Log.e(tag, Log.getStackTraceString(e));
                }
```
 
实例化插件的Application后，并不能直接使用， 此时的Application Context还是宿主（Host）的Context，直接`getResources()`，`getFilesDir()`等获取到的还是宿主的。

需要用`PluginContextWrapper`替换掉插件Application中Context。

```java

           PluginContextWrapper ctxWrapper = new PluginContextWrapper(context,
                    plugin);
            plugin.appWrapper = ctxWrapper;
            // attach
            Method attachMethod = Application.class.getDeclaredMethod(
                    "attach", Context.class);
            attachMethod.setAccessible(true);
            attachMethod.invoke(application, ctxWrapper);
            if (context instanceof Application) {
                if (android.os.Build.VERSION.SDK_INT >= 14) {
                    Application.class.getMethod("registerComponentCallbacks",
                            Class.forName("android.content.ComponentCallbacks"))
                            .invoke(context, application);
                }
            }
            
```

ContextWrapper的原理和机制参考本文后的参考文章[[5]](#参考)[[6]](#参考)[[7]](#参考)[[8]](#参考)

    

- ### 加载目录下所有插件

同加载单个插件的方法，只不过是遍历目录下的所有apk文件。


## 启动插件中的MainActivity

`startMainActivity()`中的事情比较简单，根据插件id或插件包名在之前缓存的Map中查找`PlugInfo`，通过`framwworkClassLoader`的`newActivityClassName()`方法缓存要启动的插件id及Activity类名，供`framwworkClassLoader`在loadClass时使用。

而`newActivityClassName()`方法本身只是返回一个名为`androidx.pluginmgr.PluginActivity`的代理Activity类名。

至于具体如何通过`androidx.pluginmgr.PluginActivity`加载到真正插件中的Activity，则是在`PluginClassLoader`中的`loadActivityClass`方法实现的，后面再具体分析。


## 其他方法

剩下一些删除插件、卸载插件的方法，以及一些方法的重载，就不赘述了。


本文是在学习Android pluginManager之余将做一些笔记备忘，刚开始研究插件，对其中难免有理解不正确的地方，欢迎大家留言指正，共同学习。


## 参考

1. [Java ClassLoader基础及加载不同依赖 Jar 中的公共类](http://www.trinea.cn/android/java-loader-common-class/)
2. [Android 插件化 动态升级](http://www.trinea.cn/android/android-plugin/)
3. [APK动态加载框架（DL）解析](http://blog.csdn.net/singwhatiwanna/article/details/39937639)
3. [DynamicLoadApk 源码解析](http://codekk.com/open-source-project-analysis/detail/Android/FFish/DynamicLoadApk%20%E6%BA%90%E7%A0%81%E8%A7%A3%E6%9E%90)
2. [Android与设计模式——装饰者(Decorator)模式](http://blog.csdn.net/canghai1129/article/details/41577901)
2. [深入理解 Context](http://blog.csdn.net/z1074971432/article/details/12561369)
3. [Android中Context详解 ---- 你所不知道的Context](http://blog.csdn.net/qinjuning/article/details/7310620)
4. [Android的Proxy/Delegate Application框架](http://blogs.360.cn/blog/proxydelegate-application/)
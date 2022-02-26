---
title: Android PluginManager 源码解析4--ActivityOverider
date: 2015-08-12 18:11:29
category: "android"
tags: [插件, PluginActivity, ContextWrapper]

---


## ActivityOverider概述

`ActivityOverider`负责与动态生成的`PluginActivity`交互。



`ActivityOverider`主要干了3件事：

- 修正StartActivity的Intent
- 动态生成`PluginActivity`的Dex文件
- 处理`PluginActivity`生命周期的回调，根据需要做一些特殊处理


## overrideStartActivityForResult方法解析

由于插件内的Activity没有在`AndroidManifest.xml`中注册，只注册了`androidx.pluginmgr.PluginActivity`，当通过`Context.startActivtiyForResult()`调起目标Activity时会找不到，所以需要对系统的`Context.startActivtiyForResult()`进行劫持，把要启动的Activity指向`androidx.pluginmgr.PluginActivity`，当加载`PluginActivity`时，通过`FrameworkClassLoader.loadClass()`方法再把类的加载路径修正回目标Activity，对系统进行了一个瞒天过海，骗过单纯的系统，哈哈。

startActivity可能启动的是插件内部的Activity，也可能是宿主的Activity，也可能是其它插件的Activity，这一切都交由`overrideStartActivityForResult()`方法处理。


<!-- more -->

- ### 启动明确指定类名的Activity


```java
			...
		
			// 取出ComponentName
			ComponentName compname = intent.getComponent();
			// 取包名
			String pkg = compname.getPackageName();
			// 取Activity类名
			String toActName = compname.getClassName();
			// 根据插件id取缓存PluginInfo
			PlugInfo thisPlugin = mgr.getPluginById(pluginId);
			ActivityInfo actInThisApk = null;
			PlugInfo plug = thisPlugin;
			if (pkg != null) {
				// 启动同一插件内的Activity
				if (pkg.equals(thisPlugin.getPackageName())) {
					actInThisApk = thisPlugin
							.findActivityByClassName(toActName);
				// 启动另一插件内的Activity
				}else{
					PlugInfo otherPlug = mgr.getPluginByPackageName(pkg);
					if (otherPlug != null) {
						plug = otherPlug;
						actInThisApk = otherPlug
								.findActivityByClassName(toActName);
					}
				}
			} else {
				// 容错处理，启动同一插件内的Activity
				actInThisApk = thisPlugin.findActivityByClassName(toActName);
			}

			...

			setPluginIntent(intent, plug, actInThisApk.name);
			
			...
			
```




- ### 启动有具体Action的Activity


```java

String action = intent.getAction();
PlugInfo thisPlugin = mgr.getPluginById(pluginId);
ActivityInfo actInThisApk = thisPlugin.findActivityByAction(action);
			
...

setPluginIntent(intent, thisPlugin, actInThisApk.name);

...

```

- ### 偷天换日，修改Intent

```java

private static void setPluginIntent(Intent intent, PlugInfo plugin,
			String actName) {
	PluginManager mgr = PluginManager.getInstance();
	String pluginId = plugin.getId();
	// 根据类名动态生成新的PluginActivity
	createProxyDex(plugin, actName);
	// 修改Intent中的ComponentName，将其指向androidx.pluginmgr.PluginActivity
	String act = mgr.getFrameworkClassLoader().newActivityClassName(
				pluginId, actName);
	ComponentName compname = new ComponentName(mgr.getContext(), act);
	intent.setComponent(compname);
}

```

## 动态生成PluginActivity

通过`createProxyDex()`为要加载的Activity生成代理类

```java
		try {
			String pkgName = plugin.getPackageName();
			ActivityClassGenerator.createActivityDex(activity, targetClassName,
					saveDir, plugin.getId(), pkgName);
		} catch (Throwable e) {
			Log.e(tag, Log.getStackTraceString(e));
		}

```

具体生成机制委托给`ActivityClassGenerator`实现，后面再分析。

## Activity生命周期回调

`PluginActivity`的一些生命周期方法会回调到`ActivityOverider`里。

比较重要的几个有`overrideAttachBaseContext()`，`callback_onCreate()`

先看`overrideAttachBaseContext()`。

### overrideAttachBaseContext()

```java

		PlugInfo plugin = PluginManager.getInstance().getPluginById(pluginId);
		if (plugin.getApplication() == null) {
			try {
				PluginManager.getInstance().initPluginApplication(plugin,
						null);
			} catch (Exception e) {
				Log.e(tag, Log.getStackTraceString(e));
			}
		}
		PluginActivityWrapper actWrapper = new PluginActivityWrapper(base, plugin.appWrapper, plugin);
		return new Object[] { actWrapper, plugin.getAssetManager() };

```
`overrideAttachBaseContext()`方法是为了更改Activity中的Context，把默认宿主的Context替换为修改过后的插件Context。

由于Activity是继承自`ContextThemeWrapper`，而Application是继承`ContextWrapper`，所以这里不能直接使用`PluginContextWrapper`，而是把在Application初始化时生成的`PluginContextWrapper`注入继承自`ContextThemeWrapper`的`PluginActivityWrapper`。

这样插件Application的Context与插件Activity的Context便在行为上一致了。


接着来看`callback_onCreate()`。

### callback_onCreate()

- `callback_onCreate()`先替换了Activity的Application。

因为`PluginActivity`实际还是在宿主中调起的，所以默认的Context、Application都是宿主的。既然Context已经替换了，那Application也不能漏掉。


```java
		...
				
		try {
			Field applicationField = Activity.class
					.getDeclaredField("mApplication");
			applicationField.setAccessible(true);
			applicationField.set(fromAct, plugin.getApplication());
		}  catch (Exception e) {
			e.printStackTrace();
		}
		
		...
```


- 处理activity的主题

```java
			...
		
		 // PluginActivity是动态生成并继承与原来的Activity，所以此处需要取supperClass的name
			String actName = fromAct.getClass().getSuperclass().getName();
			// 从通过PluginManifestUtil解析的Activity list中查找当前Activity的ActivityInfo
			ActivityInfo actInfo = plugin.findActivityByClassName(actName);
			int resTheme = actInfo.getThemeResource();
			// 如果使用了主题
			if (resTheme != 0) {
				boolean hasNotSetTheme = true;
				try {
					Field mTheme = ContextThemeWrapper.class
							.getDeclaredField("mTheme");
					mTheme.setAccessible(true);
					// 判断PluginActivity的mTheme字段是否为空，为空表示没有设置过主题
					hasNotSetTheme = mTheme.get(fromAct) == null;
				} catch (Exception e) {
					e.printStackTrace();
				}
				if (hasNotSetTheme) {
					// 替换PluginActivity的mActivityInfo
					changeActivityInfo(fromAct);
					fromAct.setTheme(resTheme);
				}
			}

			...

```

这里为何在设置了主题后才替换mActivityInfo，暂时还没有看懂。


- 替换PluginActivity的mActivityInfo

```java
		...

		Field field_mActivityInfo=null;
		try {
			field_mActivityInfo = Activity.class.getDeclaredField("mActivityInfo");
			field_mActivityInfo.setAccessible(true);
		}  catch (Exception e) {
			Log.e(tag, Log.getStackTraceString(e));
			return;
		}
		PluginManager con = PluginManager.getInstance();
		PlugInfo plugin = con.getPluginByPackageName(activity.getPackageName());
		
		ActivityInfo actInfo = plugin.findActivityByClassName(actName);
		actInfo.applicationInfo = plugin.getPackageInfo().applicationInfo;
		try {
			field_mActivityInfo.set(activity, actInfo);
		} catch (Exception e) {
			Log.e(tag, Log.getStackTraceString(e));
		}
		
		...

```


- 处理回调

```java

		PluginActivityLifeCycleCallback callback = PluginManager.getInstance()
				.getPluginActivityLifeCycleCallback();
		if (callback != null) {
			callback.onCreate(pluginId, fromAct);
		}

```

如果注册了`PluginActivityLifeCycleCallback`，会在相应的生命周期内触发回调。


剩下一些其他的生命周期没有做额外的处理，只是处理了`PluginActivityLifeCycleCallback`回调，就略过了。


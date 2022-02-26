---
title: Android PluginManager 源码解析3--PluginManifestUtil
date: 2015-08-11 15:12:55
category: "android"
tags: [插件, PackageManager, androidManifest, PackageInfo, ResolveInfo]

---


## PluginManifestUtil分析

**PluginManifestUtil**是**Android PluginManager**的一个工具类。只有一个公共方法`setManifestInfo()`，负责解析插件apk中的androidManifest.xml文件，并将解析的信息保存到`PluginInfo`中。


- ### 解析PackageInfo

通过`PackageManager`获取插件apk文件的`PackageInfo`，保持在`PluginInfo`中。


```java

		PackageInfo pkgInfo = context.getPackageManager()
				.getPackageArchiveInfo(
						apkPath,
						PackageManager.GET_ACTIVITIES
								| PackageManager.GET_RECEIVERS//
								| PackageManager.GET_PROVIDERS//
								| PackageManager.GET_META_DATA//
								| PackageManager.GET_SHARED_LIBRARY_FILES//
				// | PackageManager.GET_SERVICES//
				// | PackageManager.GET_SIGNATURES//
				);
		// Log.d("ManifestReader: setManifestInfo", "GET_SHARED_LIBRARY_FILES="
		// + pkgInfo.applicationInfo.nativeLibraryDir);
		info.setPackageInfo(pkgInfo);
		
```



`PackageInfo`保存有插件apk的包名、版本、注册的activities、services、receivers、providers、声明的权限等信息。
但是**Android PluginManager**目前只处理了activities、receivers。

<!-- more -->

- ### 处理so文件

查找插件apk中的`lib`中的so文件，并解压到`PluginBaseDir`即`PluginManager`中`dexInternalStoragePath` + `pluginId`+`lib`下面。

```java
		File libdir = ActivityOverider.getPluginLibDir(info.getId());
		try {
			if(extractLibFile(zipFile, libdir)){
				pkgInfo.applicationInfo.nativeLibraryDir=libdir.getAbsolutePath();
			}
		} finally {
			zipFile.close();
		}
```



查找过程会根据设备cpu架构copy相应的文件到`PluginBaseDir`。


- ### 自定义解析manifest.xml

使用`XmlManifestReader.getManifestXMLFromAPK()`读取插件apk中的manifest文件，然后通过`setAttrs()`方法解析manifest文件，把activity、reciever、application的信息保存在`PluginInfo`中。

```java

		ZipFile zipFile = new ZipFile(new File(apkPath), ZipFile.OPEN_READ);
		ZipEntry manifestXmlEntry = zipFile.getEntry(XmlManifestReader.DEFAULT_XML);
		
		String manifestXML = XmlManifestReader.getManifestXMLFromAPK(zipFile,
				manifestXmlEntry);
				
		...
		
		setAttrs(info, manifestXML);
				
```

- ### 绑定manifestXml信息到PluginInfo

分别解析application、activity、reciever、service的信息，并绑定到`PluginInfo`。


```java
		...
		
		do {
			switch (eventType) {
			case XmlPullParser.START_DOCUMENT: {
				break;
			}
			case XmlPullParser.START_TAG: {
				String tag = parser.getName();
				if (tag.equals("manifest")) {
					namespaceAndroid = parser.getNamespace("android");
				} else if ("activity".equals(parser.getName())) {
					addActivity(info, namespaceAndroid, parser);
				} else if ("receiver".equals(parser.getName())) {
					addReceiver(info, namespaceAndroid, parser);
				} else if ("service".equals(parser.getName())) {
					addService(info, namespaceAndroid, parser);
				}else if("application".equals(parser.getName())){
					parseApplicationInfo(info, namespaceAndroid, parser);
				}
				break;
			}
			case XmlPullParser.END_TAG: {
				break;
			}
			}
			eventType = parser.next();
		} while (eventType != XmlPullParser.END_DOCUMENT);
		
```

下面已activity为例分析。

```java
		...
		
		ResolveInfo act = new ResolveInfo();
		act.activityInfo = info.findActivityByClassNameFromPkg(activityName);
		do {
			switch (eventType) {
			case XmlPullParser.START_TAG: {
				String tag = parser.getName();
				if ("intent-filter".equals(tag)) {
					if (act.filter == null) {
						act.filter = new IntentFilter();
					}
				} else if ("action".equals(tag)) {
					String actionName = parser.getAttributeValue(namespace,
							"name");
					act.filter.addAction(actionName);
				} else if ("category".equals(tag)) {
					String category = parser.getAttributeValue(namespace,
							"name");
					act.filter.addCategory(category);
				} else if ("data".equals(tag)) {
					// TODO parse data
				}
				break;
			}
			}
			eventType = parser.next();
		} while (!"activity".equals(parser.getName()));
		//
		info.addActivity(act);

```

模拟系统解析`ResolveInfo`的方式，为每一个插件apk中注册的Activity生成一个`ResolveInfo`，保存在`PluginInfo`中，供之后获取指定`Intent-Filter`的Activity、Service等使用。

目前对于`intent-filter`中的`data`标签没有处理。


## 参考

1. [ResolveInfo](http://developer.android.com/reference/android/content/pm/ResolveInfo.html)
1. [android ResolveInfo运用](http://blog.csdn.net/wang_yubin/article/details/8564335)
2. [PackageInfo、ResolveInfo](http://blog.csdn.net/lo5sea/article/details/38564991)
---
title: Android PluginManager 源码解析2--FrameworkClassLoader
date: 2015-08-10 21:12:55
category: "android"
tags: [插件, 反射, ClassLoader, DexClassLoader, AndroidThread]

---


学习**Android PluginManager**加载插件的机制，需要先了解系统是如何加载Activity的。

## Android 启动Activity的机制

Android系统的Activity是通过 `AndroidThread`.`performLaunchActivity()`方法生成并启动的。

```java

        Activity activity = null;
        try {
            java.lang.ClassLoader cl = r.packageInfo.getClassLoader();
            activity = mInstrumentation.newActivity(
                    cl, component.getClassName(), r.intent);
            StrictMode.incrementExpectedActivityCount(activity.getClass());
            r.intent.setExtrasClassLoader(cl);
            r.intent.prepareToEnterProcess();
            if (r.state != null) {
                r.state.setClassLoader(cl);
            }
        } catch (Exception e) {
            if (!mInstrumentation.onException(activity, e)) {
                throw new RuntimeException(
                    "Unable to instantiate activity " + component
                    + ": " + e.toString(), e);
            }
        }


```

其中`r.packageInfo`是一个`LoadedApk`对象，保存了加载dex中class文件的ClassLoader，默认是系统的`PathClassLoader`。

通过`AndroidThread`源码，看出`AndroidThread`通过委托给`Instrumentation`的`newActivity()`方法生成Activity。

<!-- more -->


```java

    public Activity newActivity(ClassLoader cl, String className,
            Intent intent)
            throws InstantiationException, IllegalAccessException,
            ClassNotFoundException {
        return (Activity)cl.loadClass(className).newInstance();
    }

```

`newActivity()`方法使用注入的ClassLoader直接load Activity的类名生成activity。


由于默认是系统的`PathClassLoader`，不支持从apk中加载类文件，所以我们需要更改ClassLoader来实现加载插件apk中的类文件。

之前**Android PluginManager**在初始化的时候通过反射更改了Context的ClassLoader .

```java

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

其中`mBase`就是`ContextImpl`，具体原因参见[分析1](/2015/08/09/android-pluginmanager-source-code-analysis-1/#初始化插件的application)中ContextWapper的解释。

`r.packageInfo`和`ContexImpl`的`mPackageInfo`是同一对象。

这样之后在加载Activity类文件时就会使用替换过的`FrameworkClassLoader`了。


## FrameworkClassLoader

`FrameworkClassLoader`职责比较简单，主要负责根据不同的类名选择不同的classLoader加载。


```java

		if (plugId != null) {
			String pluginId = plugId;

			PlugInfo plugin = PluginManager.getInstance().getPluginById(
					pluginId);
			if (plugin != null) {
				try {
					if (className.equals(ActivityOverider.targetClassName)) {
						String actClassName = actName;
						return plugin.getClassLoader().loadActivityClass(
								actClassName);
					} else {
						return plugin.getClassLoader().loadClass(className);
					}
				} catch (ClassNotFoundException e) {
					e.printStackTrace();
				}
			}
		}

		return super.loadClass(className, resolv);
		
```

这里有三种情况：

- 加载插件中的Activity类
  
  当`className`为`androidx.pluginmgr.PluginActivity`时，说明要加载的类是由**Android PluginManager**自动生成的activity代理类，具体加载实现交由`PluginClassLoader.loadActivityClass()`处理。
  
- 加载插件中非Activity类
  
  当`className`为插件的其它自定义类时，选择`PluginClassLoader.loadClass()`加载。

- 加载宿主中的类

不是插件中的类，或者插件中的类加载异常了，选择默认的ClassLoader加载类。


引用[作者hkxxx大神](http://blog.csdn.net/hkxxx/article/details/42194387)的两张图作说明：

![插件启动流程图](/img/frameworkclassloader.png)


![framwork classloader类加载结构](/img/am_frameworkclassloader_class_diagram.png)

## PluginClassLoader

`PluginClassLoader`继承自`DexClassLoader`，使用`FrameworkClassLoader`作为其委托的父ClassLoader。

```java
	// pluginManager初始化时实例化的PluginClassLoader
 PluginClassLoader loader = new PluginClassLoader(dexPath,
                dexOutputPath, frameworkClassLoader, info);

```

```java
	// PluginClassLoader构造函数
	public PluginClassLoader(String dexPath, String optimizedDir, ClassLoader parent, PlugInfo plugin) {
		super(dexPath, optimizedDir,plugin.getPackageInfo().applicationInfo.nativeLibraryDir,parent);
		thisPlugin = plugin;
		proxyActivityLoaderMap = new HashMap<String, ClassLoader>(plugin.getActivities().size());
		this.libraryPath = plugin.getPackageInfo().applicationInfo.nativeLibraryDir;
		this.optimizedDirectory = optimizedDir;
	}

```


`PluginClassLoader`维护一个DexClassLoader的map，缓存插件每个Activity的classLoader。

为什么需要为每一个Activity都生成一个classloader呢？

接着看`loadActivityClass()`方法


```java

	Class<?> loadActivityClass(final String actClassName) throws ClassNotFoundException {
		File dexSavePath = ActivityOverider.createProxyDex(thisPlugin, actClassName, true);
		ClassLoader actLoader = proxyActivityLoaderMap.get(actClassName);
		if (actLoader == null) {
			actLoader = new DexClassLoader(dexSavePath.getAbsolutePath(), optimizedDirectory,libraryPath, this){
				@Override
				protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
					Log.d("PlugActClassLoader("+ actClassName+")", "loadClass: " + name);
					if (ActivityOverider.targetClassName.equals(name)) {
						Class<?> c = findLoadedClass(name);
						if (c == null) {
							Log.d("PlugActClassLoader("+ actClassName+")", "findClass");
							c = findClass(name);
						}
						if (resolve) {
							resolveClass(c);
						}
						return c;
					}
					return super.loadClass(name, resolve);
				}
			};
			proxyActivityLoaderMap.put(actClassName, actLoader);
		}
		return actLoader.loadClass(ActivityOverider.targetClassName);
	}

```

原来，`loadActivityClass()`方法在加载插件的Activity之前，为每个Activity使用**dexmaker**动态生成了一个代理的`PluginActivity`继承自原Activity，这样插件中的每个Activity都有一个`PluginActivity.dex`文件。


另外，由于[ClassLoader隔离问题](http://www.trinea.cn/android/java-loader-common-class/)，必须把每个classloader缓存起来，以免下次重新加载同一类会报类型转换失败的错。


这里new的DexClassLoader重载了`loadClass()`方法，当要加载类是`androidx.pluginmgr.PluginActivity`时 ，更改了默认的查找方式，不再先从parent Classloader中查找，而是直接自己查找类文件。


值得注意的是，生成`PluginActivity.dex`的过程一直处于主线程，其中进行了大量的文件操作，可能会引起ANR。


剩下就是重载ClassLoader的`loadClass()`方法了。


```java

protected Class<?> loadClass(String name, boolean resolve)
			throws ClassNotFoundException {
		synchronized (getClassLoadingLock(name)) {
			// First, check if the class has already been loaded
			Class<?> c = findLoadedClass(name);
			if (c == null) {
				if(name.startsWith("android.support.")){
					try {
						c = findClass(name);
					} catch (ClassNotFoundException e) {
					}
					if (c == null) {
						c = findByParent(name, true);
					}
				}else{
					c = findByParent(name, false);
					if (c == null) {
						c = findClass(name);
					}
				}
			}
			if (resolve) {
				resolveClass(c);
			}
			return c;
		}
	}

```

这里判断了如果类名是以`android.support.`开头，说明是support包里的类，优先从当前的classloader加载，在插件中找不到时再从宿主中查找，避免与宿主support包冲突。

如果类名不以`android.support.`开头，则还是遵循java的ClassLoader的加载类的方式，先委托给parent查找，找不到再从自己查找。


`findByParent()`方法是为了查找真正宿主的ClassLoader。先取当前ClassLoader的parent ClassLoader，如果是FrameworkClassLoader的话，继续向上查找，即是宿主的ClassLoader。


```java

Class<?> c =null;
try {
	ClassLoader parent = getParent();
	if (parent != null) {
			if (parent.getClass() == FrameworkClassLoader.class) {
				parent = parent.getParent();
			}
			if (parent != null) {
				c = parent.loadClass(name);
			}
		}
} catch (ClassNotFoundException e) {
	if(throwEx){
		throw e;
	}
}

return c;

```

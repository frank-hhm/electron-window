const {
	app,
	BrowserWindow,
	Menu,
	ipcMain,
	screen,
	dialog
} = require('electron');

// 开机自启
const AutoLaunch = require('auto-launch');

const path = require('path');
// const robot = require('robotjs');
const {
	keyboard,
	Key,
	mouse,
	Point,
	Button
} = require('@nut-tree/nut-js');
const {
	SerialPort
} = require('serialport');
// const { ByteLength } = require('@serialport/parser-byte-length');
const HID = require('node-hid');
// 存储已打开的 HID 设备实例
// key: "vid:pid" 或 path
const hidDeviceMap = new Map();
const {
	autoUpdater
} = require('electron-updater');
let mainWindow;
let appLauncher;
let serialPort = null;
let isMoving = false;
let cursorPosition = {
	x: 0,
	y: 0
}; // 初始光标位置
let tray = null; // 如果你用了托盘
let isUpdating = false;
const moveStep = 12; // 移动步长

function createWindow() {
	mainWindow = new BrowserWindow({
		icon: path.join(__dirname, 'icon.ico'), // Windows 窗口图标
		width: 1200,
		height: 1080,
		// fullscreen: true, // 启动即全屏
		// kiosk: true, // 替代 fullscreen: true
		// frame: false, // 隐藏标题栏和边框
		// autoHideMenuBar: true,
		cursor: false,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			nodeIntegration: true,
			contextIsolation: true,
			webviewTag: true,
			webgl: true, // 显式开启 WebGL
			hardwareAcceleration: true // 开启硬件加速
		}
	})
	// 关键：彻底移除菜单，Alt 键不再弹出
	// mainWindow.setMenu(null)
	// 加载本地H5文件
	// mainWindow.loadFile(path.join(__dirname, 'web/index.html'));
	// mainWindow.loadFile(path.join(__dirname, "E:/machine/unpackage/dist/dev"));
    mainWindow.loadURL('http://localhost/'); 
	// 初始化开机自启模块
	appLauncher = new AutoLaunch({
		name: 'MyUniApp',
		path: app.getPath('exe')
	});
	// 启用开机自启
	// enableAutoLaunch();
	mainWindow.on('closed', function() {
		hidDeviceMap.forEach((store, key) => {
			try {
				store.device.close();
				console.log(`🔌 已清理设备: ${key}`);
			} catch (e) {
				// ignore
			}
		});
		hidDeviceMap.clear();
		mainWindow = null;
	});
	// 隐藏默认菜单
	// Menu.setApplicationMenu(null);
    // 开发时打开控制台 
    mainWindow.webContents.openDevTools({
        mode:'bottom'
    });
}

app.whenReady().then(() => {
	createWindow();
	setupAutoUpdater(); // 初始化自动更新
});

// window-all-closed：更新模式直接放行
app.on('window-all-closed', () => {
	if (isUpdating) {
		return; // 什么都不做，让 quitAndInstall 自己处理
	}
	if (process.platform !== 'darwin') app.quit();
})

// before-quit：更新模式不拦截
app.on('before-quit', (event) => {
	if (isUpdating) {
		return; // 直接放行，不做任何拦截
	}
})

app.on('activate', () => {
	if (mainWindow === null) {
		createWindow();
	}
});

// 开启开机自启
async function enableAutoLaunch() {
	try {
		await appLauncher.enable();
		console.log('开机自启已启用');
	} catch (err) {
		console.error('无法设置开机自启:', err);
	}
}

// 关闭开机自启（可选）
async function disableAutoLaunch() {
	try {
		await appLauncher.disable();
		console.log('开机自启已禁用');
	} catch (err) {
		console.error('无法取消开机自启:', err);
	}
}

// 最小化应用
ipcMain.handle('minimize-window', async () => {
	if (mainWindow) {
		mainWindow.minimize();
	}
})

// 退出应用
ipcMain.handle('exit-application', async () => {
	if (mainWindow) {
		mainWindow.close();
	}
	app.quit();
})

// 隐藏光标
ipcMain.handle('hide-cursor', async () => {
	if (mainWindow) {
		mainWindow.setCursor("none");
	}
})

// 显示光标
ipcMain.handle('show-cursor', async () => {
	if (mainWindow) {
		mainWindow.setCursor("default");
	}
})

// 获取串口列表
ipcMain.handle('get-ports', async () => {
	return await SerialPort.list()
})

// 打开串口
ipcMain.handle('open-port', (_, {
	path,
	baudRate = 9600
}) => {
	return new Promise(async (resolve, reject) => {
		if (serialPort) {
			try {
				await serialPort.close()
			} catch (error) {
				console.error(error);
			}
		}
		serialPort = new SerialPort({
			path,
			baudRate,
			bufferSize: 4096
		}, err => {
			if (err) {
				serialPort = null
				reject(err.message)
			} else {
				resolve()
			}
		})
	})
})

// 发送数据
ipcMain.handle('send-data', (_, data) => {
	return new Promise((resolve, reject) => {
		if (!serialPort || !serialPort.isOpen) return reject('端口未打开')
		serialPort.write(data, err => {
			err ? reject(err.message) : resolve()
		})
	})
})

// 监听串口数据
// ipcMain.on('start-listening', (event) => {
// 	if (!serialPort) return;
// 	serialPort.on('data', data => {
// 		// data 是 Buffer 对象(二进制数据)
// 		// 转换为十六进制字符串
// 		const hexData = data.toString('hex');
// 		event.reply('serial-data', hexData);
// 	})
// })

// ipcMain.on('start-listening', (event) => {
// 	if (!serialPort) return;
// 	let buffer = '';
// 	serialPort.on('data', chunk => {
// 		buffer += chunk.toString('hex');
// 		// 假设数据包长度固定为32字节
// 		while (buffer.length >= 64) { // 32字节*2=64十六进制字符
// 			const data = buffer.slice(0, 64);
// 			buffer = buffer.slice(64);
// 			event.reply('serial-data', data);
// 		}
// 	});
// });

// 可用：需要增加超时重置机制（防止半包永久滞留）
// ipcMain.on('start-listening', (event) => {
// 	if (!serialPort) return;
// 	let buffer = Buffer.alloc(0);
// 	const PACKET_SIZE = 32;
// 	const HEADER = Buffer.from([0x55, 0xAA]);
// 	serialPort.on('data', chunk => {
// 		buffer = Buffer.concat([buffer, chunk]);
// 		// 循环，直到缓冲区不足一个包
// 		while (buffer.length >= PACKET_SIZE) {
// 			// 检查包头
// 			if (buffer[0] === HEADER[0] && buffer[1] === HEADER[1]) {
// 				const packet = buffer.subarray(0, PACKET_SIZE);
// 				event.reply('serial-data', packet.toString('hex'));
// 				buffer = buffer.subarray(PACKET_SIZE);
// 			} else {
// 				// 查找包头位置
// 				const headerIndex = buffer.indexOf(HEADER);
// 				if (headerIndex === -1) {
// 					// 没有找到包头，丢弃整个缓冲区（保留最后PACKET_SIZE-1个字节，因为包头可能在末尾不完整）
// 					buffer = buffer.slice(-(PACKET_SIZE - 1));
// 					break;
// 				} else {
// 					// 跳转到包头位置
// 					buffer = buffer.subarray(headerIndex);
// 					// 此时buffer长度可能不够一个包，跳出循环等待下次数据
// 					if (buffer.length < PACKET_SIZE) break;
// 					// 否则继续处理（下一次循环会处理）
// 				}
// 			}
// 		}
// 	});
// });



ipcMain.on('start-listening', (event) => {
	if (!serialPort) return;
	let buffer = Buffer.alloc(0);
	const PACKET_SIZE = 32;
	const HEADER = Buffer.from([0x55, 0xAA]);
	let lastDataTime = Date.now(); // 记录最后收到数据的时间戳
	const TIMEOUT_MS = 200; // 超时阈值(毫秒)

	// 定时检查超时
	const timeoutCheck = setInterval(() => {
		if (Date.now() - lastDataTime > TIMEOUT_MS && buffer.length > 0) {
			buffer = Buffer.alloc(0); // 重置缓冲区
			console.warn('Buffer reset due to timeout');
		}
	}, 100); // 每100ms检查一次

	serialPort.on('data', chunk => {
		lastDataTime = Date.now(); // 更新最后接收时间
		buffer = Buffer.concat([buffer, chunk]);

		let headerPos = 0; // 本次data事件中，已经处理到的位置（包括丢弃的位置）
		while (buffer.length - headerPos >= PACKET_SIZE) {
			// 从headerPos开始查找包头
			const headerIndex = buffer.indexOf(HEADER, headerPos);

			if (headerIndex === -1) {
				// 从headerPos开始直到末尾都没有找到包头，保留最后1个字节（可能包头被分割）
				headerPos = buffer.length - (HEADER.length - 1);
				if (headerPos < 0) headerPos = 0; // 防止负数
				break;
			}

			// 找到了包头，检查包头后是否有完整数据包
			if (buffer.length - headerIndex < PACKET_SIZE) {
				// 数据不够一个包，保留从包头开始的数据（headerIndex及之后）
				headerPos = headerIndex;
				break;
			}

			// 提取并处理数据包
			const packet = buffer.subarray(headerIndex, headerIndex + PACKET_SIZE);
			event.reply('serial-data', packet.toString('hex'));

			// 移动处理位置到当前包末尾
			headerPos = headerIndex + PACKET_SIZE;
		}

		// 将buffer更新为未处理部分（从headerPos开始到末尾）
		buffer = buffer.slice(headerPos);
	});

	// 关闭监听时清除定时器
	serialPort.on('close', () => {
		serialPort = null
		clearInterval(timeoutCheck)
	});
});

// 关闭串口
ipcMain.handle('close-port', () => {
	return new Promise((resolve) => {
		if (serialPort) {
			try {
				serialPort.close(err => {
					if (err) console.error(err)
					serialPort = null
					resolve()
				})
			} catch (error) {
				// serialPort = null;
				console.error(error);
			}
		}
	})
})

// 1. 获取所有 HID 设备列表
ipcMain.handle('hid:list', async () => {
	try {
		const devices = HID.devices();
		// 只返回关键字段，过滤掉无用信息
		const list = devices.map(d => ({
			vendorId: d.vendorId,
			productId: d.productId,
			manufacturer: d.manufacturer || '未知',
			product: d.product || '未知',
			path: d.path,
			serialNumber: d.serialNumber || ''
		}));
		return {
			success: true,
			data: list
		};
	} catch (err) {
		return {
			success: false,
			error: err.message
		};
	}
});

// 2. 打开设备（通过 vid + pid）
ipcMain.handle('hid:open', async (_, {
	vendorId,
	productId
}) => {
	try {
		const key = `${vendorId}:${productId}`;
		// 如果已经打开，先关闭
		if (hidDeviceMap.has(key)) {
			hidDeviceMap.get(key).close();
			hidDeviceMap.delete(key);
		}
		// 获取设备路径（vid/pid 可能匹配多台，取第一台）
		const allDevices = HID.devices();
		const target = allDevices.find(
			d => d.vendorId === vendorId && d.productId === productId
		);
		if (!target) {
			return {
				success: false,
				error: `未找到设备 VID:0x${vendorId.toString(16)} PID:0x${productId.toString(16)}`
			};
		}
		// 通过 path 打开（更精确）
		const device = new HID.HID(target.path);

		// ========== USB 粘包解析（与串口逻辑一致）==========
		let usbBuffer = Buffer.alloc(0);
		const USB_PACKET_SIZE = 32; // 一包 32 字节（和串口一样）
		const USB_HEADER = Buffer.from([0x55, 0xAA]); // 包头（和串口一样）
		let usbLastDataTime = Date.now();
		const USB_TIMEOUT_MS = 200;
		// 超时检查定时器
		const usbTimeoutCheck = setInterval(() => {
			if (Date.now() - usbLastDataTime > USB_TIMEOUT_MS && usbBuffer.length > 0) {
				usbBuffer = Buffer.alloc(0);
				console.warn('[USB] Buffer reset due to timeout');
			}
		}, 100);
		/*
		// 监听硬件主动上报的数据
		device.on('data', (buffer) => {
			console.log('📥 硬件上报:', Array.from(buffer));
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('hid:data-received', {
					vendorId,
					productId,
					data: Array.from(buffer),
					timestamp: Date.now()
				});
			}
		});
		*/
		// 监听硬件主动上报的数据
		device.on('data', (chunk) => {
			usbLastDataTime = Date.now();
			usbBuffer = Buffer.concat([usbBuffer, chunk]);

			let headerPos = 0;
			while (usbBuffer.length - headerPos >= USB_PACKET_SIZE) {
				// 从 headerPos 开始查找包头
				const headerIndex = usbBuffer.indexOf(USB_HEADER, headerPos);
				if (headerIndex === -1) {
					// 没找到包头，保留最后 (HEADER.length - 1) 个字节（防止包头被分割）
					headerPos = usbBuffer.length - (USB_HEADER.length - 1);
					if (headerPos < 0) headerPos = 0;
					break;
				}
				// 找到了包头，但剩余数据不够一包
				if (usbBuffer.length - headerIndex < USB_PACKET_SIZE) {
					headerPos = headerIndex; // 保留从包头开始的数据，等下一个 chunk
					break;
				}
				// ✅ 提取完整数据包
				const packet = usbBuffer.subarray(headerIndex, headerIndex + USB_PACKET_SIZE);
				// ✅ 发送给渲染进程（和串口一样传 hex 字符串）
				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send('hid:data-received', packet.toString('hex'));
				}
				// 移动到下一个包的位置
				headerPos = headerIndex + USB_PACKET_SIZE;
			}
			// 更新缓冲区（丢弃已处理的部分）
			usbBuffer = usbBuffer.slice(headerPos);
		});

		// 监听错误（如设备拔出）
		device.on('error', (err) => {
			clearInterval(usbTimeoutCheck);
			console.error('❌ HID 设备错误:', err.message);
			// 设备拔出时自动清理
			hidDeviceMap.delete(key);
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('hid:device-error', {
					vendorId,
					productId,
					error: err.message
				});
			}
		});

		// 存储设备实例
		hidDeviceMap.set(key, {
			device,
			vendorId,
			productId
		});

		console.log(`✅ HID 设备已打开: VID=0x${vendorId.toString(16)} PID=0x${productId.toString(16)}`);
		return {
			success: true
		};
	} catch (err) {
		return {
			success: false,
			error: err.message
		};
	}
});

// 3. 向设备发送指令
ipcMain.handle('hid:write', async (_, {
	vendorId,
	productId,
	data
}) => {
	try {
		const key = `${vendorId}:${productId}`;
		const store = hidDeviceMap.get(key);
		if (!store) {
			return {
				success: false,
				error: '设备未打开'
			};
		}

		// data 为普通数组，直接传给 write
		// 注意：如果硬件需要报告 ID，第一个字节就是报告 ID
		store.device.write(data);
		console.log('📤 发送数据:', data);

		return {
			success: true
		};
	} catch (err) {
		return {
			success: false,
			error: err.message
		};
	}
});

// 4. 关闭设备
ipcMain.handle('hid:close', async (_, {
	vendorId,
	productId
}) => {
	clearInterval(usbTimeoutCheck);
	try {
		const key = `${vendorId}:${productId}`;
		const store = hidDeviceMap.get(key);
		if (store) {
			store.device.close();
			hidDeviceMap.delete(key);
			console.log(`🔌 HID 设备已关闭: VID=0x${vendorId.toString(16)} PID=0x${productId.toString(16)}`);
		}
		return {
			success: true
		};
	} catch (err) {
		return {
			success: false,
			error: err.message
		};
	}
});

// 鼠标移动
ipcMain.on('move-cursor', async (event, direction) => {
	if (isMoving) return false;
	isMoving = true;
	try {
		const {
			width,
			height
		} = screen.getPrimaryDisplay().workAreaSize;

		switch (direction) {
			case 'up':
				cursorPosition.y = Math.max(0, cursorPosition.y - moveStep);
				break;
			case 'down':
				cursorPosition.y = Math.min(height + 20, cursorPosition.y + moveStep);
				break;
			case 'left':
				cursorPosition.x = Math.max(0, cursorPosition.x - moveStep);
				break;
			case 'right':
				cursorPosition.x = Math.min(width - 15, cursorPosition.x + moveStep);
				break;
		}

		await mouse.move(new Point(cursorPosition.x, cursorPosition.y));
		event.reply('cursor-moved', cursorPosition);
		isMoving = false;
	} catch (error) {
		console.error('鼠标移动错误:', error);
		// dialog.showErrorBox('鼠标控制错误', '无法移动鼠标: ' + error.message);
		isMoving = false;
		event.reply('cursor-error', error.message);
	}
});

// 重置鼠标到屏幕中间
ipcMain.handle('reset-cursor-to-center', async (event) => {
	try {
		const {
			width,
			height
		} = screen.getPrimaryDisplay().workAreaSize;
		// 计算屏幕中心坐标
		// const centerX = Math.floor(width / 2);
		// const centerY = Math.floor(height / 2);

		const centerX = Math.floor(width - 1);
		const centerY = Math.floor(height - 1);

		// 更新鼠标位置
		cursorPosition.x = centerX;
		cursorPosition.y = centerY;

		// 移动鼠标到中心位置
		await mouse.move(new Point(centerX, centerY));
		return cursorPosition;
	} catch (error) {
		console.error('重置鼠标位置错误:', error);
		// dialog.showErrorBox('鼠标控制错误', '无法重置鼠标到屏幕中心: ' + error.message);
		event.reply('cursor-reset-error', error.message);
	}
});

// 鼠标点击
ipcMain.on('perform-click', async (event) => {
	try {
		await mouse.move(new Point(cursorPosition.x, cursorPosition.y));
		// 等待一小段时间让鼠标移动生效
		await new Promise(resolve => setTimeout(resolve, 50));
		// 模拟按下左键
		await mouse.pressButton(Button.LEFT);
		// 等待一个短暂的按下时间
		await new Promise(resolve => setTimeout(resolve, 50));
		// 释放左键
		await mouse.releaseButton(Button.LEFT);
		// await mouse.click(Button.LEFT);
		event.reply('click-performed');
	} catch (error) {
		console.error('鼠标点击错误:', error);
		// dialog.showErrorBox('鼠标控制错误', '无法执行点击: ' + error.message);
		event.reply('click-error', error.message);
	}
});

// 空格按键点击
ipcMain.on('space-click', async (event) => {
	try {
		// 模拟按下空格按键
		await keyboard.pressKey(Key.Space)
		// 等待一个短暂的按下时间
		await new Promise(resolve => setTimeout(resolve, 50));
		// 释放空格按键
		await keyboard.releaseKey(Key.Space)
	} catch (error) {
		console.error('执行空格按键错误:', error);
		// dialog.showErrorBox('执行空格按键错误', '无法执行点击: ' + error.message);
	}
});


// 暴露变量给渲染进程
ipcMain.handle('get-serial', async () => {
	if (!serialPort) return null;
	return 'connected';
});

// 配置自动更新
function setupAutoUpdater() {
	// autoUpdater.setFeedURL({
	// 	provider: 'generic',
	// 	url: 'http://api.5k01.cyou/upload/default/exe/',
	// 	channel: 'latest'
	// });
	autoUpdater.autoDownload = false;
	// 添加错误监听
	autoUpdater.on('error', (error) => {
		console.error('更新错误:', error);
		mainWindow.webContents.send('update-error', error.message);
	});
	// 检查更新可用
	autoUpdater.on('update-available', (info) => {
		console.log('有可用更新:', info);
		mainWindow.webContents.send('update-available', info);
	});
	// 无可用更新
	autoUpdater.on('update-not-available', (info) => {
		console.log('无可用更新:', info);
		mainWindow.webContents.send('update-not-available', info);
	});
	// 添加下载进度监听
	autoUpdater.on('download-progress', (progress) => {
		mainWindow.webContents.send('update-progress', progress.percent);
	});
	// 更新下载完成事件
	// autoUpdater.on('update-downloaded', (info) => {
	// 	console.log('更新下载完成:', info);
	// 	setTimeout(() => {
	// 		// 第一个参数 false：让渲染进程正常关闭
	// 		// 第二个参数 true：强制退出
	// 		autoUpdater.quitAndInstall(false, true);
	// 	},2000);
	// 	// mainWindow.webContents.send('update-downloaded', info);
	// });
	autoUpdater.on('update-downloaded', (info) => {
		// 设置更新标志，让其他退出事件直接放行
		isUpdating = true;
		// 1. 通知渲染进程做收尾（保存数据、断开连接）
		mainWindow?.webContents?.send('app-updating');
		// 2. 注销渲染进程的 beforeunload 拦截
		BrowserWindow.getAllWindows().forEach(win => {
			try {
				win.webContents.executeJavaScript('window.onbeforeunload = null;');
			} catch (e) {
				/* 忽略已销毁的窗口 */
			}
		});
		// 3. 销毁托盘（如果有的话）
		if (tray) {
			tray.destroy();
			tray = null;
		}
		// 4. 延迟 2 秒给渲染进程收尾，然后退出安装
		setTimeout(() => {
			// 清理当前窗口
			BrowserWindow.getAllWindows().forEach(win => {
				if (!win.isDestroyed()) {
					win.removeAllListeners('close'); // 去除可能的 close 拦截
					win.close();
				}
			});
			// ★ 核心：第一个参数改成 true，强制退出 + 安装后自动重启
			autoUpdater.quitAndInstall(true, true);

			// 5. 极端保底：10 秒后还没退出，再硬杀进程
			//    10 秒足够 Squirrel 接管，不会影响自动重启
			setTimeout(() => {
				app.exit(0);
			}, 10000);
		}, 2000);
	});
}

// 手动检查更新
ipcMain.handle('check-for-update', async () => {
	try {
		const result = await autoUpdater.checkForUpdates();
		if (result.updateInfo) {
			if (app.getVersion() == result.updateInfo.version) {
				return {
					success: true,
					updateInfo: null
				}
			} else {
				return {
					success: true,
					updateInfo: result.updateInfo
				}
			}
		} else {
			return {
				success: true,
				updateInfo: null
			};
		}
	} catch (error) {
		return {
			success: false,
			error: error
		};
	}
});

// 开始下载更新
ipcMain.handle('start-download-update', async () => {
	try {
		const result = await autoUpdater.downloadUpdate();
		return {
			success: true,
			info: result
		};
	} catch (error) {
		return {
			success: false,
			error: error
		};
	}
});

// 立即安装更新
ipcMain.handle('quit-and-install', async () => {
	autoUpdater.quitAndInstall(true, true);
});
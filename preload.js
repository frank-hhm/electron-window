const {
	contextBridge,
	ipcRenderer
} = require('electron')

// 存储事件回调（防止重复绑定后旧回调丢失）
const eventCallbacks = {
	onData: null,
	onError: null
};
// 监听主进程推送的数据
ipcRenderer.on('hid:data-received', (_, payload) => {
	if (eventCallbacks.onData) {
		eventCallbacks.onData(payload);
	}
});

// 监听设备错误
ipcRenderer.on('hid:device-error', (_, payload) => {
	if (eventCallbacks.onError) {
		eventCallbacks.onError(payload);
	}
});


contextBridge.exposeInMainWorld('electronAPI', {
	// --- 串口 通讯 API ---
	getPorts: () => ipcRenderer.invoke('get-ports'),
	openPort: (options) => ipcRenderer.invoke('open-port', options),
	closePort: () => ipcRenderer.invoke('close-port'),
	sendData: (data) => ipcRenderer.invoke('send-data', data),
	onSerialData: (callback) => {
		ipcRenderer.on('serial-data', (_, data) => callback(data))
	},
	startListening: () => ipcRenderer.send('start-listening'),

	// --- HID 通讯 API ---
	
	// 列出所有 HID 设备
	listHidDevices: () => ipcRenderer.invoke('hid:list'),

	// 打开指定设备（传入十进制 VID、PID）
	openHidDevice: (vendorId, productId) =>
		ipcRenderer.invoke('hid:open', {
			vendorId,
			productId
		}),

	// 关闭指定设备
	closeHidDevice: (vendorId, productId) =>
		ipcRenderer.invoke('hid:close', {
			vendorId,
			productId
		}),

	// 发送数据（data 为普通数组，如 [0x01, 0x02, 0x03]）
	writeHidData: (vendorId, productId, data) =>
		ipcRenderer.invoke('hid:write', {
			vendorId,
			productId,
			data
		}),

	// 注册数据接收回调
	onHidDataReceived: (callback) => {
		eventCallbacks.onData = callback;
	},

	// 注册设备错误回调
	onHidDeviceError: (callback) => {
		eventCallbacks.onError = callback;
	},

	// 鼠标控制相关
	moveCursor: (direction) => ipcRenderer.send('move-cursor', direction),
	performClick: () => ipcRenderer.send('perform-click'),
	onCursorMoved: (callback) => {
		ipcRenderer.on('cursor-moved', (_, pos) => callback(pos))
	},
	onClickPerformed: (callback) => {
		ipcRenderer.on('click-performed', () => callback())
	},
	resetCursorToCenter: () => ipcRenderer.invoke('reset-cursor-to-center'),

	// 空格按键
	spaceClick: () => ipcRenderer.send('space-click'),

	// 光标隐藏显示
	hideCursor: () => ipcRenderer.invoke('hide-cursor'),
	showCursor: () => ipcRenderer.invoke('show-cursor'),

	// 最小化应用
	minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
	// 退出应用
	exitApplication: () => ipcRenderer.invoke('exit-application'),
	// 获取serialPort
	getSerial: () => ipcRenderer.invoke('get-serial'),

	// 新增：自动更新相关 API
	checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
	startDownloadUpdate: () => ipcRenderer.invoke('start-download-update'),
	quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),

	// 新增：更新状态监听
	onUpdateAvailable: (callback) => {
		ipcRenderer.on('update-available', (_, info) => callback(info))
	},
	onUpdateNotAvailable: (callback) => {
		ipcRenderer.on('update-not-available', (_, info) => callback(info))
	},
	onUpdateProgress: (callback) => {
		ipcRenderer.on('update-progress', (_, progress) => callback(progress))
	},
	// onUpdateDownloaded: (callback) => {
	// 	ipcRenderer.on('update-downloaded', (_, info) => callback(info))
	// },
	onUpdateError: (callback) => {
		ipcRenderer.on('update-error', (_, error) => callback(error))
	}
})
const electron      = require('electron')
// Module to control application life.
const app = electron.app
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow
var fs              = require( "fs" );

const path = require('path')
const url = require('url')
var config           = {};
// Check if config.json exists in app data, otherwise create it from default
// config file.
if ( !fs.existsSync( app.getPath( "userData" ) + path.sep + "config.json" )) {
    console.log( "Config file does not exist, creating it" );
    var readStream  = fs.createReadStream( __dirname + path.sep + "config.json" );
    var writeStream = fs.createWriteStream( app.getPath( "userData" ) + path.sep + "config.json" );
    writeStream.on( "close", function() {
        config = require( app.getPath( "userData" ) + path.sep + "config.json" );
    });
    readStream.pipe( writeStream );
} else {
    console.log( "Loading config from " + app.getPath( "userData" ) + path.sep + "config.json" );
    config = require( app.getPath( "userData" ) + path.sep + "config.json" );
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width:  config.windowWidth, 
    height: config.windowHeight
  })

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  mainWindow.setPosition( config.x, config.y );

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })

  mainWindow.on( "resize", function() {
    var size = mainWindow.getSize();
    config.windowWidth  = size[0];
    config.windowHeight = size[1];
    fs.writeFile( app.getPath( "userData" ) + path.sep + "config.json", JSON.stringify( config ), function( err ) {
        if ( err ) {
            console.log( err );
        }
    });
  });

  mainWindow.on( "move", function() {
    var pos = mainWindow.getPosition();
    config.x = pos[0];
    config.y = pos[1];
    fs.writeFile( app.getPath( "userData" ) + path.sep + "config.json", JSON.stringify( config ), function( err ) {
        if ( err ) {
            console.log( err );
        }
    });
  });

}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

var shouldQuit = app.makeSingleInstance(function(commandLine, workingDirectory) {
  // Someone tried to run a second instance, we should focus our window.
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

if (shouldQuit) {
  app.quit();
  return;
}

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  // if (process.platform !== 'darwin') {
    app.quit()
  // }
})

// app.on('activate', function () {
//   // On OS X it's common to re-create a window in the app when the
//   // dock icon is clicked and there are no other windows open.
//   if (mainWindow === null) {
//     createWindow()
//   }
// })

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

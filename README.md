# RTSP-Recorder

Recording RTSP stream to video files.
This module read `RTSP` stream with `ffmpeg` and write video from this stream to file.
And this module can stream video to `websocket`.

## Example

```js
var Recorder = require('rtsp-recorder');

var rec = new Recorder({
    url: 'rtsp://login:pass@192.168.1.1/path', //url to rtsp stream
    timeLimit: 10, //length of one video file (seconds)
    folder: 'videos/', //path to video folder
    prefix: 'vid-', //prefix for video files
    movieWidth: 1280, //width of video
    movieHeight: 720, //height of video
    maxDirSize: 1024*20, //max size of folder with videos (MB), when size of folder more than limit folder will be cleared
    maxTryReconnect: 15 //max count for reconnects

});

//start recording
rec.initialize();

//start stream to websocket, port 8001
rec.wsStream(8001);
```

## Options

`url` - url to rtsp stream

`timeLimit` - length of one video file (seconds)

`folder` - path to video folder

`prefix` - prefix for video files

`movieWidth` - width of video (px)

`movieHeight` - height of video (px)

`maxDirSize` - max size of folder with videos (MB), when size of folder more than limit folder will be cleared

`maxTryReconnect` - max count for reconnects
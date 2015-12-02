/**
 * Created by Shoom on 02.12.15.
 */

var Recorder = require('./../RTSPRecorder');

var rec = new Recorder({
    url: 'rtsp://login:pass@192.168.1.1/path',
    timeLimit: 10,
    folder: 'videos/',
    prefix: 'vid-',
    movieWidth: 1280,
    movieHeight: 720,
    maxDirSize: 1024*20,
    maxTryReconnect: 15

});

rec.initialize().wsStream(8001);
/**
 * Created by Shoom on 02.12.15.
 */

var oneCamera = false;

if(oneCamera){
    var Recorder = require('./../RTSPRecorder');

    var rec = new Recorder({
        url: 'rtsp://admin:admin@192.168.1.145/11',
        timeLimit: 10,
        folder: 'videos/',
        prefix: 'vid-',
        movieWidth: 1280,
        movieHeight: 720,
        maxDirSize: 1024*20,
        maxTryReconnect: 15

    });

    rec.initialize().wsStream(8001);
}else{
    var RecorderFarm = require('./../RecorderFarm');

    var farm = new RecorderFarm(
        'example/runCamera.js',
        require('./cameras.json')
    );

    farm.initialize();
}
/**
 * Created by Shoom on 02.12.15.
 */

var Recorder = require('../RTSPRecorder.js');

var rec = new Recorder({
    url: 'rtsp://login:pass@rtsp_stream:554',
    timeLimit: 10,
    name: 'cam1',
    folder: 'videos/'
});
rec.initialize();
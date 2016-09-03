(function($) {
    var currentunixtime = $('#currentunixtime'); 
    currentunixtime.text(Math.round(+new Date() / 1000));

    var tid;    

    function updateTime(node){
        tid = setTimeout(function(){
            node.text(Math.round(+new Date() / 1000));
            updateTime(node);
        }, 1000);
    };

    updateTime(currentunixtime);


    var convertBtn = $("#timestamp2TimeStr");
    var timestamp = $("#timestamp");
    var timesResult = $("#timeStrResult");
    convertBtn.click(function(){
        var time = timestamp.val();
        timesResult.val(new Date(time * 1000).toLocaleString());
    });

    var convertBtn2 = $("#timestamp2TimeStr2");
    var timestamp2 = $("#timestamp2");
    var timesResult2 = $("#timeStrResult2");
    convertBtn2.click(function(){
        var time = timestamp2.val();
        console.log("xxx");
        timesResult2.val(Math.round(+new Date(time) / 1000));
    });

    timestamp.val(Math.round(+new Date() / 1000));
    timestamp2.val(new Date().toLocaleString());

})(jQuery);
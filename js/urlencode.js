(function($) {
    var encodeBtn = $("#encode");
    var decodeBtn = $("#decode");
    var input = $("#input");
    var output = $("#output");


    encodeBtn.click(function(){
        var text = input.val();
        output.val(encodeURIComponent(text));
    });

    decodeBtn.click(function(){
        var text = input.val();
        output.val(decodeURIComponent(text));
    });


})(jQuery);
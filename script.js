const dbName = "pbxConsole";
const maxExt = 100;
const refreshRate = 30000;
const timeout = 3000;
var sServer = null; 
var sExtension = null;
var db;
var request = indexedDB.open(dbName, 2);
var bLoaded = false;

request.onsuccess = function(event) {
  db = event.target.result;
  if(bLoaded === true) {
    fillConsole();
    doSettings();
  }
};

request.onerror = function(event) {
  // Handle errors.
};

request.onupgradeneeded = function(event) {
  db = event.target.result;

  // Create an objectStore to hold information about our console buttons. We're
  // going to use "cell" as our key path because it's guaranteed to be unique 
  /*** CREATE CONSOLE BUTTONS ***/
  if(!db.objectStoreNames.contains("buttons")) {
    var objectStore = db.createObjectStore("buttons", { keyPath: "cell" });

    objectStore.transaction.oncomplete = function(event) {
      // Store values in the newly created objectStore.
      var buttonObjectStore = db.transaction("buttons", "readwrite").objectStore("buttons");
      buttonData.forEach(function(button) {
        buttonObjectStore.add(button);
      });
      if(bLoaded === true) fillConsole();
    };
  }
  /*** CREATE SETTINGS SETTINGS ***/
  if(!db.objectStoreNames.contains("settings")) {
    var settingsStore = db.createObjectStore("settings", { autoIncrement : true });
  }
};

/*** SHOW CONTACTS ***/
var iSearch = null;
var sSearch = null;
function shoContacts(search) {
  sSearch = search !== undefined ? search : sSearch;
  if(iSearch !== null) {
    window.clearTimeout(iSearch);
    iSearch = window.setTimeout(shoContacts, 300);
    return true;
  }
  iSearch = 0;
  $.get(sServer + 'contacts.php', {"order_by": "contact_nickname", "search_all": sSearch},function(cContacts){
    $('section#list address').html('');
    for(var c in cContacts) {
      var oContact = cContacts[c];
      if(oContact.contact_nickname === null && oContact.contact_name_family === null) continue;
      
      if(oContact.contact_phones.length > 0) {
        var sNumber = oContact.contact_phones[0].phone_number;
      } else {
        sNumber = "0";
      }
      $('section#list address').append('<a href="#" data-phone-number="' + sNumber + '" alt="Click to call">' 
        + (oContact.contact_nickname !== null ? " " + oContact.contact_nickname : "")
        + (oContact.contact_name_suffix !== null ? " " + oContact.contact_name_suffix : "")
        + (oContact.contact_name_family !== null ? " " + oContact.contact_name_family : "") + "</a>"
        + '<a class="more" rel="' + oContact.contact_uuid + '"href="#">&gt;</a>')
    }
    iSearch = null;
  });
  return true;
}
  
/*** SHOW CONSOLE STATUS ***/
function getStatus() {
  if(sServer === null) return false;
  var aExtensions = [];
  $('section.console a[data-extension]').each(function(){
    aExtensions.push(this.getAttribute('data-extension'));
  });
  $.post(sServer + "get_call_activity.php", {"call": "ACTIVITY", "extensions": aExtensions}, function(oResult){
    $('section.console a[data-extension] div.led').attr("class", "led");
    var cExtensions = oResult.extensions;
    for(var e in cExtensions) {
      var oExtension = cExtensions[e]; 
      /*** CHECK IF CONNECTED ***/
      if(oExtension.connected !== true) {
        continue;
      }

      /*** CHECK IF DND ***/
      if(oExtension.do_not_disturb === "true") {
        $('section.console a[data-extension="' + oExtension.extension + '"] div.led').addClass('disturb');
        continue;        
      }

      /*** CHECK CALL STATE ***/
      switch(oExtension.callstate) {
        case "ACTIVE": 
        case "RINGING": 
        case "RING_WAIT": 
          $('section.console a[data-extension="' + oExtension.extension + '"] div.led').addClass('busy');
          break;
        default: 
          $('section.console a[data-extension="' + oExtension.extension + '"] div.led').addClass('available');
          break;        
      }
    }
  }).always(function(){
    window.setTimeout(getStatus, refreshRate);
  });
}

/*** CHECK SETTINGS ***/
function shoExtension(oExtension) {
  $('input[name="pbx_do_not_disturb"]').prop("checked", oExtension.do_not_disturb === "true");
  $('input[name="pbx_voicemail_enabled"]').prop("checked", oExtension.voicemail.voicemail_enabled === "true");
  if(oExtension.forward_all_enabled === "true") {
    $('input[name="pbx_forward_all_enabled"]').prop("checked", true);
    $('input[name="pbx_forward_all_destination"]').prop("disabled", false);
  } else {
    $('input[name="pbx_forward_all_enabled"]').prop("checked", false);
    $('input[name="pbx_forward_all_destination"]').prop("disabled", true);
  }
  $('input[name="pbx_forward_all_destination"]').val(oExtension.forward_all_destination);
  $('input[name="pbx_effective_caller_id_name"]').val(oExtension.effective_caller_id_name);
  $('input[name="pbx_directory_first_name"]').val(oExtension.directory_first_name);
  $('input[name="pbx_directory_mid_fix"]').val(oExtension.directory_mid_fix);
  $('input[name="pbx_directory_last_name"]').val(oExtension.directory_last_name);
}
function login(oSettings, fCallback){
    var oButton = $("button#connect");
    oButton.text("...");
    $.get(oSettings.server + "extensions.php", {"extension": oSettings.extension, "password": oSettings.password}, function(oResult){
    /*** UPDATE LOGIN DATA ***/
    if(oResult.code === 0) {
      var oExtension = oResult.extension;
      shoExtension(oExtension);
      oSettings.password = oExtension.password;
      var settingObjectStore = db.transaction("settings", "readwrite").objectStore("settings");
      settingObjectStore.put(oSettings, 0);
      oButton.text("verbonden");
      sServer = oSettings.server;
      sExtension = oSettings.extension;
      /*** SHOW EXTENSION DETAILS */
      console.log(oResult.message);
      if(fCallback) fCallback();
    } else if(oResult.message) {
      if(!$("a#doset").hasClass("on")) setSettings();
      oButton.text("verbinden");
      alert(oResult.message);
    } else {
      if(!$("a#doset").hasClass("on")) setSettings();
      oButton.text("verbinden");
      alert("Er is geen verbinding mogelijk met de server. Controleer het adres");
    }
  }).fail(function(){
    oButton.text("verbinden");
    alert("Er is geen verbinding mogelijk met de server. Controleer het adres");
  });
}

function doSettings() {
  var oSettings = null;
  /*** GET EXTENSION LABELS ***/
  db.transaction("settings").objectStore("settings").openCursor().onsuccess = function(event) {
    var cursor = event.target.result;
    if (cursor) {
      sServer = cursor.value.server
      oSettings = {"server": sServer, "extension": cursor.value.extension, "password": cursor.value.password}
      cursor.continue();
    } else if(sServer === null) {
      setSettings();
    } else {
      login(oSettings, function(){
        shoContacts();
      });
    }
  }
}

/*** OPEN SETTINGS ***/
function setSettings(){
  if($("a#doset").hasClass("on")) {
    $("h1").text("Contacten");
    $("a#doset").removeClass("on");
    $("section#list").show();
    $("section#settings").hide();
  } else {
    db.transaction("settings").objectStore("settings").openCursor().onsuccess = function(event) {
      var cursor = event.target.result;
      if (cursor) {
        $('input[name="pbx_address"]').val(cursor.value.server), 
        $('input[name="pbx_extension"]').val(cursor.value.extension), 
        $('input[name="pbx_password"]').val(cursor.value.password), 
        cursor.continue();
      } else {
        $("h1").text("Instellingen");
        $("div#contact").show();
        $("a#doset").addClass("on");
        $("section#list, section#detail").hide();
        $("section#settings").show();
      }
    }
  }
}

/*** LOAD CONSOLE ***/
function fillConsole() { 
  /*** GET EXTENSION LABELS ***/
  db.transaction("buttons").objectStore("buttons").openCursor().onsuccess = function(event) {
    var cursor = event.target.result;
    if (cursor) {
      $("#" + cursor.key).attr("data-extension", cursor.value.extension)
        .attr("data-label", cursor.value.label)
        .append(cursor.value.label.replace(/[\r\n]+/g, "<br>"));
      cursor.continue();
    } else if(sServer !== null) {
      getStatus();
    } else {
      doSettings()
    }
  }
}

/*** CONTACTS ***/
$(document).ready(function() {
  /*** SET REST TIMEOUT ***/
  $.ajaxSetup({ timeout: timeout });

  /*** GENERAL DRAG AND DROP FUNCTIONS ***/
  var sID = null;
  function doDragStart(ev) {
    $(ev.currentTarget).addClass('drag');
    sID = ev.originalEvent.target.id;
    ev.effectAllowed = "move";
  }

  function doDragOver(ev) {
    $(ev.currentTarget).addClass('over');
    ev.preventDefault();
  }

  function doDrop(ev, fCallback) {
    try {
      ev.preventDefault();
      var oDiv = ev.target
      if(oDiv.tagName != "DIV")  oDiv = oDiv.parentNode;
      ev.currentTarget.insertBefore(document.getElementById(sID), oDiv);
      sID = null;  
      if(fCallback) fCallback();
    } catch(oError){
      console.log(ev.target.tagName)
    }
    $(ev.currentTarget).removeClass('over');
  }

  function doDragEnd(ev) { 
    $('div.drag').removeClass('drag');
    $('fieldset.over').removeClass('over');
  }
  
  /*** SEARCH CONTACTS ***/
  $("#search").on("keyup", function() {
    if(this.value.length > 2) {
      shoContacts(this.value);
    } else if(this.value.length == 0) {
      shoContacts("");
    }
  });

  /*** ADD CONTACT ***/
  $("section").on("click", "a#add", function() {
    $("input[name=contact_uuid]").val("");
    $("input[name=contact_name_prefix]").val([""]);
    $("input[name=contact_name_given]").val("");
    $("input[name=contact_name_middle]").val("");
    $("input[name=contact_name_suffix]").val("");
    $("input[name=contact_name_family]").val("");
    $("input[name=contact_organization]").val("");
    
    $("fieldset.phone div:not(.add)").remove();
    $("fieldset.phone div.add input").val("");

    $("fieldset.email div:not(.add)").remove();
    $("fieldset.email div.add input").val("");
    $("section#list").hide();
    $("section#detail").show();
  });
  
  $("section").on("click", "a[data-phone-number]", function(){
    var sNumber =  this.getAttribute("data-phone-number");
    if(sNumber != "0") {
      $.get(sServer + "fs.php", {"user": sExtension, "destination": sNumber}, function(oResult){
        if(oResult.code != 0) {
          var sMessage = "Fout onbekend."
          switch(oResult.code) {
            case 1050:
              sMessage = "Uw telefoon is niet verbonden.";
              break;
            default:
              sMessage = oResult.message;
              break;
          }
          alert(sMessage);
        } 
      });
    } else {
      alert("Er is geen telefoonnummer bekend voor dit contact.");
    }
  });

  /*** CONTACT EDITING ***/
  $("section").on("click", "a.more", function() {
    $.get(sServer + "contacts.php", {"contact_uuid": this.getAttribute("rel")}, function(oResult) {
      $("input[name=contact_uuid]").val(oResult.contact_uuid);
      $("input[name=contact_name_prefix]").val([oResult.contact_name_prefix]);
      $("input[name=contact_name_given]").val(oResult.contact_name_given);
      $("input[name=contact_name_middle]").val(oResult.contact_name_middle);
      $("input[name=contact_name_suffix]").val(oResult.contact_name_suffix);
      $("input[name=contact_name_family]").val(oResult.contact_name_family);
      $("input[name=contact_organization]").val(oResult.contact_organization);

      /*** CONTACT PHONES ***/
      $("fieldset.phone div:not(.add)").remove();
      $("fieldset.phone div.add input").val("");
      var iLast = 0;
      for(var p in oResult.contact_phones) {
        iLast += 100;
        var oPhone = oResult.contact_phones[p];
        $("fieldset.phone div.add").before('<div id="' + oPhone.contact_phone_uuid + '" draggable="true"><a role="button" class="mov"></a>'
          + '<input type="hidden" name="contact_phones[' + oPhone.contact_phone_uuid +  '][sequence]" value="' + iLast + '">'
          + '<input type="text" name="contact_phones[' + oPhone.contact_phone_uuid +  '][label]" placeholder="' + oPhone.phone_label + '" class="label" value="' + oPhone.phone_label + '">'
          + '<input type="text" name="contact_phones[' + oPhone.contact_phone_uuid +  '][number]" placeholder="telefoonnummer" value="' + oPhone.phone_number + '">'
          + '<a role="button" class="del"></a></div>');
      }
      $('fieldset.phone div.add input[name$="[sequence]"]').val(iLast + 100);

      /*** CONTACT EMAILS ***/
      $("fieldset.email div:not(.add)").remove();
      $("fieldset.email div.add input").val("");
      var iLast = 0;
      for(var e in oResult.contact_emails) {
        iLast += 100;
        var oEmail = oResult.contact_emails[e];
        $("fieldset.email div.add").before('<div id="' + oEmail.contact_email_uuid + '" draggable="true"><a role="button" class="mov"></a>'
          + '<input type="hidden" name="contact_emails[' + oEmail.contact_email_uuid +  '][sequence]" value="' + iLast + '">'
          + '<input type="text" name="contact_emails[' + oEmail.contact_email_uuid +  '][label]" placeholder="' + oEmail.email_label + '" class="label" value="' + oEmail.email_label + '">'
          + '<input type="text" name="contact_emails[' + oEmail.contact_email_uuid +  '][email]" placeholder="e-mailadres" value="' + oEmail.email_address + '">'
          + '<a role="button" class="del"></a></div>');
      }
      $('fieldset.email div.add input[name$="[sequence]"]').val(iLast + 100);

      $("section#list").hide();
      $("section#detail").show();
    });
  });
  function updContact() {
    var oContact = {};
    $("section#detail form fieldset.name div:not(.add) input").each(function() {
      switch(this.type.toLowerCase()) {
        case "checkbox":
        case "radio":
          if(this.checked === true)  oContact[this.name] = this.value;
          break;
        default:
         oContact[this.name] = $(this).val();
         break;
      }
    });
    /*** AT LEAST ONE NAME  */
    if(oContact.contact_uuid == "" 
      && oContact.contact_organization == "" 
      && oContact.contact_name_family == ""
      && oContact.contact_name_given == "") return true;

    $.post(sServer + "contacts.php", oContact, function(oResult) {
      $("input[name=contact_uuid]").val(oResult.contact_uuid);
      for(var p in oResult.contact_phones){
        var oPhone = oResult.contact_phones[p];
        if($('input[name="contact_phones[' + oPhone.contact_phone_uuid + '][label]"]').length > 0) continue;
        $('div[id="__NEW__"] input[name="contact_phones[0][sequence]"]').attr("name", "contact_phones[" + oPhone.contact_phone_uuid + "][sequence]");
        $('div[id="__NEW__"] input[name="contact_phones[0][label]"]').attr("name", "contact_phones[" + oPhone.contact_phone_uuid + "][label]");
        $('div[id="__NEW__"] input[name="contact_phones[0][number]"]').attr("name", "contact_phones[" + oPhone.contact_phone_uuid + "][number]");
        $('div[id="__NEW__"]').attr('id', oPhone.contact_phone_uuid);
        break;
      }
      for(var e in oResult.contact_emails){
        var oEmail = oResult.contact_emails[e];
        if($('input[name="contact_emails[' + oEmail.contact_email_uuid + '][label]"]').length > 0) continue;
        $('div[id="__NEW__"] input[name="contact_emails[0][sequence]"]').attr("name", "contact_emails[" + oEmail.contact_email_uuid + "][sequence]");
        $('div[id="__NEW__"] input[name="contact_emails[0][label]"]').attr("name", "contact_emails[" + oEmail.contact_email_uuid + "][label]");
        $('div[id="__NEW__"] input[name="contact_emails[0][email]"]').attr("name", "contact_emails[" + oEmail.contact_email_uuid + "][email]");
        $('div[id="__NEW__"]').attr('id', oEmail.contact_email_uuid);
        break;
      }
    });
  }
  $("section#detail").on("change", "form fieldset input", updContact);

  /*** EDIT PHONES ***/
  /*** INIT DRAG AND DROP ***/
  $('section#detail').on('drop', 'fieldset.phone', function(ev){
      doDrop(ev, function(){
        var iLast = 0;
        $('fieldset.phone div:not(.add) input[name$="[sequence]"]').each(function(){
          iLast += 100
          $(this).val(iLast);
        });
        updContact();
      })
    }).on('dragover', 'fieldset.phone', doDragOver);
  $('section#detail').on('drag', 'fieldset.phone div:not(.add)', doDragStart).on('dragend', 'fieldset.phone div:not(.add)', doDragEnd);
  $('section#detail').on('click', 'fieldset.phone div a.mov', function(){
    $(this).parent().prop('draggable',true);
  });
  /** ADD PHONE ***/
  $('section#detail').on('change', 'form fieldset.phone div.add input.label', function() {
    $("section#detail form fieldset.phone div.add").clone()
      .removeClass('add')
      .attr('id', '__NEW__')
      .prop('draggable', true)
      .insertBefore("section#detail form fieldset.phone div.add")
      .prepend('<a class="mov"></a>')
      .append('<a class="del"></a>')
      .find('input:eq(2)').focus();
     this.value="";
     var oSeq = $('section#detail form fieldset.phone div.add input[name$="[sequence]"]');
     oSeq.val(parseInt(oSeq.val()) + 100);
  });
  /*** DELETE PHONE NUMBER ***/
  $("section#detail").on("click", "form fieldset.phone a.del", function() {
    var oDiv = $(this).parent();
    $.ajax({
      method: "DELETE",
      url: sServer + "contacts.php", 
      data: {"contact_phone_uuid": oDiv.attr('id')}, 
      success: function(oResult) {
        oDiv.remove();
      }
    })
  });

  /*** EDIT EMAIL ***/
  /*** INIT DRAG AND DROP ***/
  $('section#detail').on('drop', 'fieldset.email', function(ev){
    doDrop(ev, function(){
      var iLast = 0;
      $('fieldset.email div:not(.add) input[name$="[sequence]"]').each(function(){
        iLast += 100
        $(this).val(iLast);
      });
      updContact();
    })
  }).on('dragover', 'fieldset.email', doDragOver);
  $('section#detail').on('drag', 'fieldset.email div:not(.add)', doDragStart).on('dragend', 'fieldset.email div:not(.add)', doDragEnd);
  $('section#detail').on('click', 'fieldset.email div a.mov', function(){
    $(this).parent().prop('draggable',true);
  });
  /** ADD EMAIL ***/
  $('section#detail').on('change', 'form fieldset.email div.add input.label', function() {
    $("section#detail form fieldset.email div.add").clone()
      .removeClass('add')
      .attr('id', '__NEW__')
      .prop('draggable', true)
      .insertBefore("section#detail form fieldset.email div.add")
      .prepend('<a class="mov"></a>')
      .append('<a class="del"></a>')
      .find('input:eq(2)').focus();
    this.value="";
    var oSeq = $('section#detail form fieldset.email div.add input[name$="[sequence]"]');
    oSeq.val(parseInt(oSeq.val()) + 100);
  });
  /*** DELETE EMAIL ***/
  $("section#detail").on("click", "form fieldset.email a.del", function() {
    var oDiv = $(this).parent();
    $.ajax({
      method: "DELETE",
      url: sServer + "contacts.php", 
      data: {"contact_email_uuid": oDiv.attr('id')}, 
      success: function(oResult) {
        oDiv.remove();
      }
    })
  });

  /*** HIDE CONTACT EDIT ***/
  $("section").on("click", "a.less", function() {
    $("section#detail").hide();
    $("section#list").show();
    shoContacts();
  });
  
  /*** SHOW/HIDE SETTINGS ***/
  $("button#docon").on("click", function() {
    if($(window).width() > 830) {
      $(this).removeClass("open");
      window.resizeBy(-282, 0);
    } else if($(this).hasClass("open") && $(window).width() > 560) {
      $(this).html('&lt;')
      window.resizeBy(282, 0);
    } else if($(this).hasClass("open")) {
      window.resizeBy(282, 0);
    } else  {
      window.resizeBy(-282, 0);
      $(this).html('&gt;')
      $(this).addClass("open");
    }
    return false;
  });

  /*** SET SETTINGS ***/
  $("a#doset").on("click", function() {
    setSettings();
  });
  
  $("button#connect").on("click", function(){
    var oSettings = {
      server: $('input[name="pbx_address"]').val(), 
      extension: $('input[name="pbx_extension"]').val(), 
      password: $('input[name="pbx_password"]').val(), 
    }
    login(oSettings, function(){
      shoContacts();
      getStatus();
    });
  });
  /*** EXTENSION EDITING ***/
  $("section#settings fieldset.ext_status input, section#settings fieldset.ext_coor input").on("change", function(){
    if(this.name == "pbx_forward_all_enabled") {
      if($(this).prop("checked")) {
        $('section#settings fieldset.ext_status input[name="pbx_forward_all_destination"]').prop("disabled", false).focus();
      } else {
        $('section#settings fieldset.ext_status input[name="pbx_forward_all_destination"]').prop("disabled", true);
      }
    }
    var oExtension = {
      "extension": $('input[name="pbx_extension"]').val(),
      "do_not_disturb": $('input[name="pbx_do_not_disturb"]').prop("checked"),
      "voicemail_enabled": $('input[name="pbx_voicemail_enabled"]').prop("checked"),
      "forward_all_enabled": $('input[name="pbx_forward_all_enabled"]').prop("checked"),
      "forward_all_destination": $('input[name="pbx_forward_all_destination"]').val(),
      "effective_caller_id_name": $('input[name="pbx_effective_caller_id_name"]').val(),
      "directory_first_name": $('input[name="pbx_directory_first_name"]').val(),
      "directory_mid_fix": $('input[name="pbx_directory_mid_fix"]').val(),
      "directory_last_name": $('input[name="pbx_directory_last_name"]').val()
    };
    $.post(sServer + 'extensions.php', oExtension, function(oResult){
      try {
        if(oResult.code != 0) throw new Error(oResult.message);
        console.log(oResult.message);
      } catch(e) {
        alert("Er is een fout opgetreden: " + e.message + "\r\n" + oResult);
      }
    });
  });
  /*** INIT CONSOLE ***/
  $("section.console address").html("");
  var iHeight = $("section.console").height() - $("section.console address").height();
  var iMax = 1;
  while(iHeight > $("section.console address").height()) {
    $("section.console address").each(function(index) {
      var sCol = "ABCDEFG".substr(index, 1);
      var iRow = this.childNodes.length + 1;
      var sCell = sCol + iRow;
      $(this).append('<a id="' + sCell + '" href="#" class="back"><div class="led" title="Wijzigen"></div></a>');
    });
    if(iMax++ > maxExt) break;
  }
  
  if(db) fillConsole();  
  bLoaded = true;
  
  $("section.console").on("click", "div.led", function() {
    $('form#extEdit input[name="extension"]').val($(this).parent().attr("data-extension"));
    $('form#extEdit textarea[name="label"]').val($(this).parent().attr("data-label"));
    $(this).parent().addClass("edit")
      .html("")
      .append($("form#extEdit"));
    return false;
  });

  /*** EXTENSION LOOKUP ***/
  var iGetExt = null;
  $("section.console").on("keyup", 'input[name="extension"]', function() {
    if(iGetExt !== null) {
      window.clearTimeout(iGetExt);
      iGetExt = null;
    }
    if(this.value.length > 2) {
      var sSearch =  this.value;
      iGetExt = window.setTimeout(function() {
        $.get(sServer + 'extensions.php', {search: sSearch}, function(cExtensions){
          if(cExtensions.length == 0) return false;
          $('ul#extList').html("").show();
          for(const e in cExtensions) {
            var oExtension = cExtensions[e];
            oExtension.fullname = oExtension.directory_last_name 
            ? oExtension.directory_first_name 
              + (oExtension.directory_mid_fix ? oExtension.directory_mid_fix : " ")
              + oExtension.directory_last_name
            : oExtension.description;
            $('ul#extList').append('<li data-extension="' +oExtension.extension+ '" data-fullname="' +oExtension.fullname+ '">'  
              + oExtension.extension + ": " + oExtension.fullname
              + "</li>");
          }
        })}, 300);
    } else {
      $('ul#extList').html("").hide();
    }
  });
  /** CHOOSE RETREIVED EXTENSION ***/
  $("section.console").on("click", "ul#extList li", function() {
    $('form#extEdit input[name="extension"]').val($(this).attr('data-extension'));
    $('form#extEdit textarea[name="label"]').val($(this).attr('data-fullname') + "\r\n" + $(this).attr('data-extension'));
    $('ul#extList').html("").hide();
  });

  /*** CLEAR EXTENSION ***/
  $("section.console form#extEdit").on("click", "fieldset div a.del", function() {
    $('form#extEdit input[name="extension"]').val("");
    $('form#extEdit textarea[name="label"]').val("");
  });

  $("section.console form#extEdit button").on("click", function() { 
    if($('ul#extList li').length == 1) {
      $('form#extEdit input[name="extension"]').val($('ul#extList li:first').attr('data-extension'));
      $('form#extEdit textarea[name="label"]').val($('ul#extList li:first').attr('data-fullname') 
        + "\r\n" + $('ul#extList li:first').attr('data-extension'));
    }
    $('ul#extList').html("").hide();
    var oButton = {
      cell: $(this).parents("a").attr("id"),
      extension: $('form#extEdit input[name="extension"]').val(),
      label: $('form#extEdit textarea[name="label"]').val(),
      command: ""};
    $(this).parents("a").attr("data-extension", oButton.extension);
    $(this).parents("a").attr("data-label", oButton.label);
    $(this).parents("a").removeClass("edit")
      .prepend('<div class="led" title="Wijzigen"></div>' + $('form#extEdit textarea[name="label"]').val().replace(/[\r\n]+/g, "<br>"));
    $("section.console").append($("form#extEdit"));
    $("form#extEdit :input").val("");
    
    /*** ADD TO DB ***/
    var transaction = db.transaction(["buttons"], "readwrite");
    var objectStore = transaction.objectStore("buttons");
    if(oButton.label.length > 0) {
      var request = objectStore.put(oButton);
    } else {
      var request = objectStore.delete(oButton.cell);
    }
    request.onsuccess = function(event) {
      $('form#extEdit input[name="extension"]').val("");
      $('form#extEdit textarea[name="label"]').val("");
    };
    return false;
  });

  $("section.console").on("click", "a[data-extension]:not(.edit)", function(){
    try {
      var sNumber =  this.getAttribute("data-extension");
      if(sNumber == "0") throw new Error("Er is geen telefoonnummer bekend voor dit contact.");
      if($(this).find("div.led.available").length == 0) throw new Error("Dit toestel is niet beschikbaar.")
      $.get(sServer + "fs.php", {"user": sExtension, "destination": sNumber}, function(oResult){
        if(oResult.code != 0) {
          var sMessage = "Fout onbekend."
          switch(oResult.code) {
            case 1050:
              sMessage = "Uw telefoon is niet verbonden.";
              break;
            default:
              sMessage = oResult.message;
              break;
          }
          alert(sMessage);
        } 
      });
    } catch(e){
      alert(e.message)
    }
  });
});

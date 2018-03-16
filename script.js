const dbName = "pbxConsole";
const maxExt = 100;
const refreshRate = 3000;
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
      if(oContact.contact_phones.length > 0) {
        var sNumber = oContact.contact_phones[0].phone_number;
      } else {
        sNumber = "0";
      }
      $('section#list address').append('<a href="#" data-phone-number="' + sNumber + '" alt="Click to call">' + oContact.contact_nickname
        + (oContact.contact_name_suffix !== null ? " " + oContact.contact_name_suffix : "")
        + " " + oContact.contact_name_family + "</a>"
        + '<a class="more" rel="' + oContact.contact_uuid + '"href="#">&gt;</a>')
    }
    iSearch = null;
  });
  return true;
}
  
/*** SHOW CONSOLE STATUS ***/
function getStatus() {
  if(sServer === null) {
    window.setTimeout(getStatus, refreshRate);
    return false;
  }
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
        $('section.console a[data-extension="' + oExtension.extension + '"] div.led').addClass('busy');
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
function login(oSettings, fCallback){
    var oButton = $("button#connect");
    oButton.text("...");
    $.get(oSettings.server + "extensions.php", {"extension": oSettings.extension, "password": oSettings.password}, function(oResult){
    /*** UPDATE LOGIN DATA ***/
    if(oResult.code === 0) {
      var oExtension = oResult.extension;
      oSettings.password = oExtension.password;
      var settingObjectStore = db.transaction("settings", "readwrite").objectStore("settings");
      settingObjectStore.put(oSettings, 0);
      oButton.text("verbonden");
      sServer = oSettings.server;
      sExtension = oSettings.extension;
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
  /*** OPHALEN LABELS ***/
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
        getStatus();
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
        $("section#list").hide();
        $("section#settings").show();
      }
    }
  }
}

/*** LOAD CONSOLE ***/
function fillConsole() { 
  /*** OPHALEN LABELS ***/
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

$(document).ready(function() {
  $.ajaxSetup({ timeout: timeout });
  
  /*** SEARCH CONTACTS ***/
  $("#search").on("keyup", function() {
    if(this.value.length > 2) {
      shoContacts(this.value);
    } else if(this.value.length == 0) {
      shoContacts("");
    }
  });

  /*** EDITING CONTACTS ***/
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
  $("section").on("click", "a.more", function() {
    $.get(sServer + "contacts.php", {"contact_uuid": this.getAttribute("rel")}, function(oResult) {
      $("input[name=contact_uuid]").val(oResult.contact_uuid);
      $("input[name=contact_name_prefix]").val([oResult.contact_name_prefix]);
      $("input[name=contact_name_given]").val(oResult.contact_name_given);
      $("input[name=contact_name_middle]").val(oResult.contact_name_middle);
      $("input[name=contact_name_suffix]").val(oResult.contact_name_suffix);
      $("input[name=contact_name_family]").val(oResult.contact_name_family);
      $("input[name=contact_organization]").val(oResult.contact_organization);
      $("fieldset.phone div:not(.add)").remove();
      $("fieldset.phone div.add input").val("");
      for(var p in oResult.contact_phones) {
        var oPhone = oResult.contact_phones[p];
        $("fieldset.phone div.add").before("<div>"
          + '<input type="text" name="contact_phones[' + oPhone.contact_phone_uuid +  '][label]" placeholder="' + oPhone.phone_label + '" class="label" value="' + oPhone.phone_label + '">'
          + '<input type="text" name="contact_phones[' + oPhone.contact_phone_uuid +  '][number]" placeholder="telefoonnummer" value="' + oPhone.phone_number + '"></div>');
      }
      $("section#list").hide();
      $("section#detail").show();
    });
  });
  $("section#detail").on("change", "form fieldset input", function() {
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
    $.post(sServer + "contacts.php", oContact, function(oResult) {
      $("input[name=contact_uuid]").val(oResult.contact_uuid);
      for(var p in oResult.contact_phones){
        var oPhone = oResult.contact_phones[p];
        if($('input[name="contact_phones[' + oPhone.contact_phone_uuid + '][label]"]').length > 0) continue;
        $('div:not(.add) input[name="contact_phones[0][label]"]').attr("name", "contact_phones[" + oPhone.contact_phone_uuid + "][label]");
        $('div:not(.add) input[name="contact_phones[0][number]"]').attr("name", "contact_phones[" + oPhone.contact_phone_uuid + "][number]");
        break;
      }
    });
  });
  $("section#detail form fieldset.phone div.add input.label").on('change', function() {
    $("section#detail form fieldset.phone div.add").clone()
      .removeClass('add')
      .insertBefore("section#detail form fieldset.phone div.add")
      .find('input:eq(1)').focus();
     this.value="";
  });

  $("section").on("click", "a.less", function() {
    $("section#detail").hide();
    $("section#list").show();
    shoContacts();
  });
  
  $("button#docon").on("click", function() {
    if($(this).hasClass("on")) {
      $(this).removeClass("on");
      $(this).html("&gt;")
      $("div#contact").hide();
    } else {
      $(this).addClass("on");
      $(this).html("&lt;")
      $("div#contact").show();
    }
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

  $("section.console form#extEdit button").on("click", function() {
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
      console.log(event.target.result);
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

// Will hold the settings stored in localStorage
let settings = {};

// Will hold the locations manually entered and stored in localStorage
let local_locations = {};

// Array of frequent guests
let frequent_guests = [];

// Object containing selected guests
let selected_guests = {};

// Will hold the scanner instance
let qr_scanner = null;

/**
 * Callback called by the scanner once it has detected a QR code
 */
function qrCodeSuccessCallback(decoded_text, decoded_result) {

    // Extract the code from the URL
    const location_code = decoded_text.substring(decoded_text.lastIndexOf('/') + 1);

    // Only codes which are 13 digits long
    if (/^\d{13}$/.test(location_code)) {

        const gsn_prefix = location_code.substring(0, 7);
        const short_code = location_code.substring(7);

        qr_scanner.stop();
        qr_scanner.clear();

        let location_name = lookupByLongCode(gsn_prefix, short_code);

        // If we matched the code against a known location
        if (location_name) {
            selectLocation(location_name);
        } else {
            // Otherwise, update the location code input with the shortcode
            // and go to the manual entry page (to add the location to localStorage)
            document.getElementById('location_code').value = short_code;
            showStep('step_manual');
        }
    }
};

/**
 * Looks up locations by short_code (manual entry)
 */
function lookupByShortCode(short_code) {

    if (local_locations && local_locations[short_code] ) {
        return [local_locations[short_code]];
    }

    if (db_locations) {
        let results = [];
        for (let gsn_prefix in db_locations) {
            if (db_locations[gsn_prefix][short_code]) {
                results.push(db_locations[gsn_prefix][short_code]);
            }
        }

        return results;
    }

    return [];
}

/**
 * Looks up locations by gsn_prefix + short_code (from the scanner)
 */
function lookupByLongCode(gsn_prefix, short_code) {

    if (local_locations && local_locations[short_code] ) {
        return local_locations[short_code];
    }

    if (db_locations && db_locations[gsn_prefix] && db_locations[gsn_prefix][short_code]) {
        return db_locations[gsn_prefix][short_code];
    }

    return null;
}

/**
 * Hides all the steps
 */
function hideAllSteps() {
    let elements = document.getElementsByClassName('step');
    for (let element of elements) {
        element.classList.add('hidden');
    }
}

/**
 * Updates the innerText of all elements with a specific class
 */
function updateText(class_name, text_content) {
    let elements = document.getElementsByClassName(class_name);
    for (let element of elements) {
        if (class_name === 'location_name') {
            element.innerHTML = text_content;
        } else {
            element.innerText = text_content;
        }
    }
}

/**
 * Cancels the scan and returns to the first step
 */
function cancelScan() {

    hideAllSteps();
    qr_scanner.stop();

    setTimeout(() => {
        showStep('step_check_in_now');
    }, 1000);
}

/**
 * Cancels scanning and shows the manual entry page
 */
function showManual() {

    if (!!settings.use_scanner) {

        // :FIXME: there is a promise in there that may still trigger an async error if scan is aborted quickly
        try {
            qr_scanner.stop();
        } catch (e) {}

        try {
            qr_scanner.clear();
        } catch (e) {}
    }

    showStep('step_manual');
}

/**
 * Shows the vaxxed cert modal
 */
function showCert(patron_index) {

    // Populate the cert values
    let patron_data = getPatronData(patron_index);

    let name_html = `<span class="first_name">${escapeHTML(patron_data.first_name)}</span> <span class="last_name">${escapeHTML(patron_data.last_name)}</span>`;
    document.getElementById('text-name').innerHTML = name_html;

    let dob_html = new Date(patron_data.dob).toLocaleDateString('au-AU', { year: 'numeric', month: 'short', day: 'numeric'});
    document.getElementById('text-dateofbirth').innerHTML = dob_html;

    let vaxxed_date_html = new Date(patron_data.vaxxed_date).toLocaleDateString('au-AU', { year: 'numeric', month: 'short', day: 'numeric'});
    document.getElementById('text-validfrom').innerHTML = vaxxed_date_html;

    // Show the popup
    document.getElementById('step_cert').classList.remove('hidden');
}

/**
 * Hides the vaxxed cert modal
 */
function hideCert() {
    document.getElementById('step_cert').classList.add('hidden');
}

/**
 * Shows a specific step
 */
function showStep(step_id) {
    hideAllSteps();
    document.getElementById(step_id).classList.remove('hidden');

    switch (step_id) {

        case 'step_splash':
            if (settings.state == 'qld') {
                setTimeout(() => {
                    showStep('step_check_in_now');
                }, 1000);
            } else {
                showStep('step_check_in_now');
            }
            break;

        case 'step_loading':
            setTimeout(() => {
                showStep('step_check_in');
            }, 250);
            break;

        case 'step_check_in_now':
            document.getElementById('location_code').value = '';
            document.getElementById('location_name').value = '';

            // Reset location code inputs
            var els  = document.getElementsByClassName('location-code-input');
            Array.from(els).forEach((el) => {
                el.value = '';
            });

            // Reset selected guests
            selected_guests = {};
            document.getElementById('guest_checkin_link').innerText = 'Check In';

            renderLastCheckin();
            break;

        case 'step_scan':

            // Skip to manual entry if the scanner is disabled
            if (!settings.use_scanner) {
                return showStep('step_manual');
            }

            // :NOTE: on computer width / height seems to be the right one, but then does not work on mobile anymore.
            // should orientation be checked ??
            const config = { fps: 25, qrbox: parseInt(window.innerWidth * 0.6), disableFlip: true, aspectRatio: window.innerHeight / window.innerWidth };
            qr_scanner.start({ facingMode: "environment" }, config, qrCodeSuccessCallback);
            break;

        case 'step_manual':

            // If there is already a value in, it would be coming from the scanner
            if (!!document.getElementById('location_code').value) {
                // Show Not Found and hide location code input
                document.getElementById('search_results').innerHTML = 'Location Not Found<br />';
                document.getElementById('location_code_container').classList.add('hidden');

                // Show the location name form
                showLocationNameForm();
            } else {

                // Select the first code input
                document.getElementById('location_code_1').focus();

                // Reset search results
                document.getElementById('search_results').innerHTML = '';

                // Reset location code inputs
                var els  = document.getElementsByClassName('location-code-input');
                Array.from(els).forEach((el) => {
                    el.value = '';
                });

                // Hide the location name form
                document.getElementById('location_name_container').classList.add('hidden');
            }
            break;

        case 'step_guests_checkin':
            populateFrequentGuestsList();


            break;

        case 'step_success':

            // Populate checked in patrons
            populateCheckInPatrons();

            // Play the check in sound
            let audio_element = document.getElementById("success_audio");
            audio_element.play();

            saveLastCheckIn();
            break;
    }
}

/**
 * Populate the list of frequent guests
 */
function populateFrequentGuestsList() {
    let html = '';

    if (frequent_guests.length === 0) {
        html = '<small class="muted">No guest added yet</small>';
    } else {
        let index = 0;
        for (let guest of frequent_guests) {

            let is_checked = selected_guests[index] !== undefined;

            html += `<div class="guest-container">
                <input id="guest_${index}_checkbox" class="guest-checkbox" onclick="updateGuestSelection();" value="${index}" ${is_checked ? 'checked ' : ''}type="checkbox" />
                <label for="guest_${index}_checkbox"><small class="muted">${escapeHTML(guest.first_name)} ${escapeHTML(guest.last_name)}</small></label>
            </div>`;
            index++;
        }
    }

    document.getElementById('frequent_guests_list').innerHTML = html;
}

/**
 * Updates the selected guests whenever a guest is selected
 */
function updateGuestSelection() {

    // Update selection
    selected_guests = {};
    let guest_checkboxes = document.getElementsByClassName('guest-checkbox');
    for (let checkbox of guest_checkboxes) {
        if (checkbox.checked) {
            let guest_index = parseInt(checkbox.value);
            selected_guests[guest_index] = frequent_guests[guest_index];
        }
    }

    // Update link text
    let link_text = 'Check In';
    let selected_guests_count = Object.keys(selected_guests).length;
    if (selected_guests_count === 1) {
        link_text += ' with 1 guest';
    } else if (selected_guests_count > 1) {
        link_text += ' with ' + selected_guests_count + ' guests';
    }

    document.getElementById('guest_checkin_link').innerText = link_text;
}

/**
 * Renders a specific checked in patron on the final screen
 */
function renderCheckInPatron(patron_index) {

    let patron_data = getPatronData(patron_index);
    let margin_class = patron_index === -1 ? 'margin-top-1-5' : 'margin-top-0-5';

    let html = '';
    if (patron_data.vaxxed_date === '') {

        let patron_label = `<div class="patron_label">${escapeHTML(patron_data.first_name.charAt(0))}${escapeHTML(patron_data.last_name.charAt(0))}</div>`;

        html += `<div class="${margin_class}">
            <a href="#" onclick=" return false;" class="btn patron">
                ${patron_label}
                <span style="margin-left: 15px;" class="first_name">${escapeHTML(patron_data.first_name)}</span> <span class="last_name">${escapeHTML(patron_data.last_name)}</span>
            </a>
        </div>`;
    } else {
        html += `<div class="${margin_class}">
            <a href="#" onclick="showCert(${patron_index}); return false;" class="btn patron view_cert_link">
                <img class="img-cert-tick" src="assets/img/cert_tick.gif" />
                <div style="float: left; margin-left: 15px;"><span class="first_name">${escapeHTML(patron_data.first_name)}</span> <span class="last_name">${escapeHTML(patron_data.last_name)}</span></div>
                <div style="clear: both;"></div>
            </a>
        </div>`;
    }

    return html;
}

/**
 * Retrieves the data associated to the main user or a guest
 * -1 for main user; other ints for frequent guests
 */
function getPatronData(patron_index) {

    let patron_data = settings;
    if (patron_index !== -1) {
        patron_data = selected_guests[patron_index];
    }

    return patron_data;
}

/**
 * Populates the list of checked in patrons on the final screen
 */
function populateCheckInPatrons() {

    let html = '';

    // Render main patron
    html += renderCheckInPatron(-1);

    // Render guests
    for (let guest_key of Object.keys(selected_guests)) {
        html += renderCheckInPatron(guest_key);
    }

    document.getElementById('success_patrons_container').innerHTML = html;
}

/**
 * Renders the location name (escaped + new lines handling)
 */
function renderLocationName(location_name) {

    let parts = [];
    for (let part of location_name.split("\n")) {
        parts.push(escapeHTML(part));
    }

    return parts.join('<br />');
}

/**
 * Updates the UI with the selected location and redirects to loading / check in step
 */
function selectLocation(location_name, render = true) {

    // May arrive here with location_name already rendered
    if (render) {
        location_name = renderLocationName(location_name);
    }

    document.getElementById('location_name').value = location_name;

    updateText('location_name', location_name);
    showStep('step_loading');
}

/**
 * Autocompletes the location name as you type using locations_search.js
 */
function autoCompleteLocationName(event) {

    var key = event.keyCode || event.charCode;
    if (event.shiftKey || event.altKey || event.ctrlKey || key == 8 || key == 46 || key == 13) {
        return;
    }

    let element = document.getElementById('location_name');
    let current_value = element.value;

    if (current_value !== '') {
        for (let term of locations_search) {
            if (term.startsWith(current_value)) {
                let selection_start = current_value.length;
                element.value = term + ' ';
                element.setSelectionRange(selection_start, element.value.length);
                break;
            }
        }
    }
}

/**
 * Saves the last check in location name and time
 */
function saveLastCheckIn() {
    let location_name = document.getElementById('location_name').value;

    if (!!location_name) {
        localStorage.setItem('last_checkin_name', location_name);
        localStorage.setItem('last_checkin_time', Math.round((new Date()).getTime() / 1000));
    }
}

/**
 * Renders the last check in on the homescreen
 */
function renderLastCheckin() {

    let location_name = localStorage.getItem('last_checkin_name');
    let last_checkin_time = localStorage.getItem('last_checkin_time');

    if (!!location_name && !!last_checkin_time) {

        let diff_seconds = Math.round((new Date()).getTime() / 1000) - parseInt(last_checkin_time);
        let duration = '';

        if (diff_seconds < 60) {                                                // Less than a minute
            duration = 'less than a minute';
        } else if (diff_seconds < 60 * 60) {                                    // Less than an hour
            let diff_minutes = Math.floor(diff_seconds / 60);
            duration = 'about ' + renderPlural(diff_minutes, 'minute');
        } else if (diff_seconds < (60 * 60 * 24)) {                             // Less than a day
            let diff_hours = Math.floor(diff_seconds / (60 * 60));
            duration = 'about ' + renderPlural(diff_hours, 'hour');
        } else if (diff_seconds < (60 * 60 * 24 * 30)) {                        // Less than a month
            let diff_days = Math.floor(diff_seconds / (60 * 60 * 24));
            duration = 'about ' + renderPlural(diff_days, 'day');
        } else {                                                                // The rest
            let diff_months = Math.floor(diff_seconds / (60 * 60 * 24 * 30));
            if (!diff_months) {
                diff_months += 1;
            }

            duration = 'about ' + renderPlural(diff_months, 'month');
        }

        let html = `Last Check In: <span id="last_checkin_location">${renderLocationName(location_name.replace("\n", ' '))}</span> ${duration} ago`;
        document.getElementById('last_checkin').innerHTML = html;
    }
}

/**
 * HTML entity encoding
 */
function escapeHTML(val) {
    return val.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
        return '&#'+i.charCodeAt(0)+';';
    });
}

/**
 * Handles plurals
 */
function renderPlural(value, text) {
    let output = value + ' ' + text;

    if (value > 1) {
        output += 's';
    }

    return output;
}

/**
 * Saves a frequent guest to localStorage
 */
function saveGuest() {

    // Save the guest to localStorage
    let guest = {};
    guest.first_name = document.getElementById('guest_first_name').value;
    guest.last_name = document.getElementById('guest_last_name').value;
    guest.dob = document.getElementById('guest_dob').value;
    guest.vaxxed_date = document.getElementById('guest_vaxxed_date').value;

    frequent_guests.push(guest);
    localStorage.setItem('frequent_guests', JSON.stringify(frequent_guests));

    // Reset form
    document.getElementById('guest_first_name').value = '';
    document.getElementById('guest_last_name').value = '';
    document.getElementById('guest_dob').value = '';
    document.getElementById('guest_vaxxed_date').value = '';

    // Show the guest checkin list
    showStep('step_guests_checkin');
}

/**
 * Saves the settings to localStorage
 */
function saveSettings() {
    settings.state = document.getElementById('settings_state').value;
    settings.use_scanner = !!parseInt(document.getElementById('settings_use_scanner').value);
    settings.first_name = document.getElementById('settings_first_name').value;
    settings.last_name = document.getElementById('settings_last_name').value;
    settings.phone = document.getElementById('settings_phone').value;
    settings.email = document.getElementById('settings_email').value;
    settings.dob = document.getElementById('settings_dob').value;
    settings.vaxxed_date = document.getElementById('settings_vaxxed_date').value;

    localStorage.setItem('settings', JSON.stringify(settings));
    window.location.reload();
}

/**
 * Resets everything that has been stored in localStorage
 */
function resetApp() {
    localStorage.removeItem('settings');
    localStorage.removeItem('local_locations');
    localStorage.removeItem('frequent_guests');
    init();
}

/**
 * Location code key down handler
 */
function handleLocationCodeKeyDown(event) {
    let element = event.target;
    let key = event.keyCode || event.charCode;

    if (element.value === '' && key == 8 && element.previousElementSibling) {
        element.previousElementSibling.value = '';
        element.previousElementSibling.focus();
        return false;
    } else if (element.value !== '' && key >= 96 && key <= 105 && !event.altKey && !event.shiftKey && !event.ctrlKey) {
        return false;
    }
}

/**
 * Location code key up handler
 */
function handleLocationCodeInput(event) {

    let element = event.target;
    let key = event.keyCode || event.charCode;

    if (document.getElementById('location_code_1').value !== ''
        && document.getElementById('location_code_2').value !== ''
        && document.getElementById('location_code_3').value !== ''
        && document.getElementById('location_code_4').value !== ''
        && document.getElementById('location_code_5').value !== ''
        && document.getElementById('location_code_6').value !== ''
    ) {
        let val = '';
        val += document.getElementById('location_code_1').value;
        val += document.getElementById('location_code_2').value;
        val += document.getElementById('location_code_3').value;
        val += document.getElementById('location_code_4').value;
        val += document.getElementById('location_code_5').value;
        val += document.getElementById('location_code_6').value;

        document.getElementById('location_code').value = val;

        searchLocation();
    } else {
        document.getElementById('location_code').value = '';

        // Reset search results
        document.getElementById('search_results').innerHTML = '';

        // Hide the location name form
        document.getElementById('location_name_container').classList.add('hidden');
    }

    if (element.value !== '' && element.nextElementSibling && element.nextElementSibling.value === '') {
        element.nextElementSibling.focus();
    }
}

/**
 * Handler to search for a location based on its short code
 */
function searchLocation() {

    var short_code = document.getElementById('location_code').value;

    if (/^\d{6}$/.test(short_code) === false) {
        document.getElementById('location_name_container').classList.add('hidden');
        document.getElementById('search_results').innerHTML = '';
        return;
    }

    let results = lookupByShortCode(short_code);

    // If there are some matching locations
    if (results.length) {

        // Hide the location name form
        document.getElementById('location_name_container').classList.add('hidden');

        if (results.length === 1) {         // If there is only 1 result, auto-select it
            selectLocation(results[0]);
        } else {                            // Otherwise update search results and show a list of locations
            let html = '';
            for (let location of results) {
                // Pass false to selectLocation() from here as it is already rendered
                html += `<a href="#" class="margin-top-1 btn btn-small" onclick="selectLocation(this.innerHTML, false); return false;">${renderLocationName(location)}</a>`;
            }

            document.getElementById('search_results').innerHTML = html;
        }
    } else {
        document.getElementById('search_results').innerHTML = 'Location Not Found<br />';
        showLocationNameForm();
    }
}

/**
 * Displays the form allowing to enter a new location name and focuses on its input
 */
function showLocationNameForm() {
    document.getElementById('location_name_container').classList.remove('hidden');
    window.scrollTo(0,document.body.scrollHeight);
    document.getElementById('location_name').focus();
}

/**
 * Saves a new location to localStorage
 */
function saveLocation() {
    var location_code = document.getElementById('location_code').value;
    var location_name = document.getElementById('location_name').value;

    if(!location_name) {
        return;
    }

    // If there is a location short code and a name, save to localStorage
    if (!!location_code) {
        local_locations[location_code] = location_name;
        localStorage.setItem('local_locations', JSON.stringify(local_locations));
    }

    // Update location name in UI and go to the loading/check in page
    selectLocation(location_name);
}

/**
 * Initializes the UI based on the settings
 */
function initUI() {

    // Update state, first_name, last_name, email and phone to localStorage
    document.getElementById('settings_state').value = settings.state;
    document.getElementById('settings_use_scanner').value = settings.use_scanner ? '1' : '0';
    document.getElementById('settings_first_name').value = settings.first_name;
    document.getElementById('settings_last_name').value = settings.last_name;
    document.getElementById('settings_email').value = settings.email;
    document.getElementById('settings_phone').value = settings.phone;
    document.getElementById('settings_dob').value = settings.dob;
    document.getElementById('settings_vaxxed_date').value = settings.vaxxed_date;

    // Update references to first_name
    updateText('first_name', settings.first_name);

    // Update references to last_name
    updateText('last_name', settings.last_name);

    // Update references to email
    updateText('email', settings.email);

    // Update references to phone
    updateText('phone', settings.phone);

    // Update references to dob
    updateText('dob', new Date(settings.dob).toLocaleDateString('au-AU', { year: 'numeric', month: 'short', day: 'numeric'}));

    // Update references to vaxxed date
    updateText('vaxxed_date', new Date(settings.vaxxed_date).toLocaleDateString('au-AU', { year: 'numeric', month: 'short', day: 'numeric'}));

    // Skin - Update body class
    document.body.className = '';
    document.body.classList.add(settings.state);

    // Skin - Update images
    document.getElementById('img_check_in_now').src = `assets/img/${settings.state}/check_in_now.png`;
    document.getElementById('img_unite').src = `assets/img/${settings.state}/unite.png`;
    document.getElementById('img_tick').src = `assets/img/${settings.state}/tick.png`;

    // Update page icon
    document.getElementById('shortcut_link').href = `assets/img/${settings.state}/launcher.png`;
    document.getElementById('shortcut_link_apple').href = `assets/img/${settings.state}/launcher.png`;

    // Per state text
    let thank_you_folks_element = document.getElementById('thank_you_folks');
    switch (settings.state) {
        case 'act':
            document.title = 'Check In CBR';
            document.getElementById('thank_you_message').classList.add('hidden');
            break;

        case 'qld':
            document.title = 'Check In Qld';
            document.getElementById('thank_you_message').classList.remove('hidden');
            thank_you_folks_element.innerText = 'Queenslanders';
            break;

        case 'nt':
            document.title = 'The Territory Check In';
            document.getElementById('thank_you_message').classList.remove('hidden');
            thank_you_folks_element.innerText = 'Territorians';
            break;

        case 'tas':
            document.title = 'Check In TAS';
            document.getElementById('thank_you_message').classList.remove('hidden');
            thank_you_folks_element.innerText = 'Tasmanians';
            break;
    }

    // Update web app title
    document.getElementById('web_app_title').content = document.title;

    // Load the correct images
    var els  = document.getElementsByClassName('img_checkin');
    Array.from(els).forEach((el) => {
        el.src = `assets/img/${settings.state}/checkin.png`;
    });
}

/**
 * Initializes the app
 */
function init() {

    // Retrieve settings from localStorage
    let local_settings = localStorage.getItem('settings');
    local_settings = JSON.parse(local_settings);
    let has_local_settings = !!local_settings;

    // Settings defaults
    settings = {
        state: 'qld',
        use_scanner: true,
        first_name: '',
        last_name: '',
        phone: '',
        email: '',
        dob: '',
        vaxxed_date: '',
    };

    // Bind settings from localStorage
    if (has_local_settings) {
        if (local_settings['state']) {
            settings.state = local_settings['state'];
        }

        if ('use_scanner' in local_settings) {
            settings.use_scanner = local_settings['use_scanner'];
        }

        if (local_settings['first_name']) {
            settings.first_name = local_settings['first_name'];
        }

        if (local_settings['last_name']) {
            settings.last_name = local_settings['last_name'];
        }

        if (local_settings['email']) {
            settings.email = local_settings['email'];
        }

        if (local_settings['phone']) {
            settings.phone = local_settings['phone'];
        }

        if (local_settings['dob']) {
            settings.dob = local_settings['dob'];
        }

        if (local_settings['vaxxed_date']) {
            settings.vaxxed_date = local_settings['vaxxed_date'];
        }
    }

    // If not set, set the vax date randomly somewhere between 7 and 60 days
    if (!settings.vaxxed_date) {
        var min_days = 7;
        var max_days = 60;
        var vax_date = new Date();
        vax_date.setUTCSeconds(vax_date.getUTCSeconds() - 60 * 60 * 24 * (Math.floor(Math.random() * (max_days - min_days + 1)) + min_days));
        settings.vaxxed_date = vax_date.toLocaleDateString('au-AU', { year: 'numeric', month: 'short', day: 'numeric'});
    }

    // Reduce the db_locations to only the current state
    db_locations = db_locations[settings.state];

    // Initialized the UI
    initUI();

    // No local settings, show settings form
    if (!has_local_settings) {
        showStep('step_get_started');
        return;
    }

    // Load locations from localStorage
    let storage_locations = localStorage.getItem('local_locations');
    storage_locations = JSON.parse(storage_locations);
    if (!!storage_locations) {
        local_locations = storage_locations;
    }

    // Load frequent guests from localStorage
    let storage_guests = localStorage.getItem('frequent_guests');
    storage_guests = JSON.parse(storage_guests);
    if (!!storage_guests) {
        frequent_guests = storage_guests;
    }

    // Initialize the QR scanner only if it hasn't been disabled
    if (!!settings.use_scanner) {
        qr_scanner = new Html5Qrcode("qr_reader");
    }

    // With local settings, ready to check in
    showStep('step_check_in_now');

    // :FIXME: To prevent a glitch when loading fonts for the cert later on
    // showCert(); hideCert();

    // Set cert clock
    setInterval(function() {
        var date = new Date().toLocaleDateString('au-AU', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'}).replace(',', '');
        document.getElementById('txt').innerText = date;
    }, 1000);
}

window.onload = function() {
    init();
};
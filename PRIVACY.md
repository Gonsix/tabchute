# TabChute data and permissions

TabChute does not send template data to a developer server and includes no analytics, advertising or third-party favicon provider.

## Data stored

Group names, colors, optional site labels, URLs, IDs and revision numbers are stored locally in the browser profile using `chrome.storage.local`. They remain after browser restart and are deleted when their template is deleted or the extension is uninstalled. Each browser and profile has its own templates; TabChute does not sync them.

The most recent opening operation stores its name, target window, created tab IDs, failed URLs and errors in `chrome.storage.session`. This data is cleared by browser restart, extension reload/disable, replacement with a newer operation, or the result's **Dismiss** button. It is used to show results after the popup closes and detect interrupted work.

Site icons are displayed through the browser's built-in favicon service. TabChute does not fetch registered websites to scrape their icons or store icon images. Opening a template navigates the browser to the chosen sites; those websites then handle their own normal requests and data.

## Permissions

- `storage`: save local templates and temporary opening results.
- `tabGroups`: set the title, color and expanded state of newly created groups.
- `favicon`: display website icons in the editor.

TabChute does not request broad site access, browsing-history access, content-script injection or the `tabs` permission for reading URLs and titles. It uses tab creation, movement, grouping and activation APIs for user-requested opening operations.

The extension supports normal desktop windows. Incognito use is disabled.

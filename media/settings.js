// @ts-check

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // DOM Elements
    const loadingElement = document.getElementById('loading');
    const resetAllBtn = document.getElementById('resetAllBtn');
    const tabs = document.querySelectorAll('.settings-tab');
    const panels = document.querySelectorAll('.settings-panel');
    const searchInput = document.getElementById('settings-search');
    const clearSearchBtn = document.getElementById('clear-search');

    // State
    let settings = {};
    let settingsData = {};

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        // Request settings from extension
        vscode.postMessage({ command: 'getSettings' });

        // Set up event listeners
        setupEventListeners();
    });

    // Handle messages from the extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'settingsLoaded':
                settingsData = message.settingsData;
                // Extract just the values for the settings object
                settings = {};
                for (const [key, data] of Object.entries(settingsData)) {
                    settings[key] = data.value;
                }
                renderSettings();
                hideLoading();
                break;

            case 'settingUpdated':
                // Update local settings
                settings[message.key] = message.value;
                settingsData[message.key].value = message.value;

                // For server settings, we need special handling
                if (message.key === 'enableApiServer' || message.key === 'enableMcpServer') {
                    // Find the checkbox and setting item
                    const settingItem = document.querySelector(`.setting-item[data-key="${message.key}"]`);
                    if (settingItem) {
                        // Remove loading state
                        settingItem.classList.remove('loading');

                        // Find and update the checkbox
                        const checkbox = settingItem.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            checkbox.disabled = false;
                            checkbox.checked = message.value;
                        }
                    }

                    if (message.success) {
                        if (message.value) {
                            // Server was successfully enabled
                            showNotification(`${message.key === 'enableApiServer' ? 'API' : 'MCP'} server started successfully`, 'success');
                        } else {
                            // Server was successfully disabled
                            showNotification(`${message.key === 'enableApiServer' ? 'API' : 'MCP'} server stopped successfully`, 'success');
                        }
                    } else {
                        // Show error
                        showNotification(`Failed to ${message.value ? 'start' : 'stop'} server: ${message.error}`, 'error');
                    }
                } else {
                    // Normal setting update
                    if (message.success) {
                        // Show success indicator
                        showNotification(`Setting "${formatSettingName(message.key)}" updated successfully`, 'success');
                    } else {
                        // Show error
                        showNotification(`Failed to update setting: ${message.error}`, 'error');
                    }
                }

                // Update dependent settings visibility
                updateDependentSettings();

                // If MCP server setting was changed, refresh the panel to show/hide info box
                if (message.key === 'enableMcpServer' || message.key === 'mcpPort') {
                    const mcpPanel = document.getElementById('MCP Server');
                    if (mcpPanel && mcpPanel.classList.contains('active')) {
                        // Get the current settings for MCP Server
                        const mcpSettings = [];
                        for (const [key, data] of Object.entries(settingsData)) {
                            if (data.category === 'MCP Server') {
                                mcpSettings.push({
                                    key,
                                    value: settings[key],
                                    ...data
                                });
                            }
                        }

                        // Clear and re-render the MCP panel
                        mcpPanel.innerHTML = '';
                        renderCategorySettings(mcpPanel, mcpSettings);
                    }
                }

                // If API server setting was changed, refresh the panel to show/hide info box
                if (message.key === 'enableApiServer' || message.key === 'apiPort') {
                    const apiPanel = document.getElementById('API Server');
                    if (apiPanel && apiPanel.classList.contains('active')) {
                        // Get the current settings for API Server
                        const apiSettings = [];
                        for (const [key, data] of Object.entries(settingsData)) {
                            if (data.category === 'API Server') {
                                apiSettings.push({
                                    key,
                                    value: settings[key],
                                    ...data
                                });
                            }
                        }

                        // Clear and re-render the API panel
                        apiPanel.innerHTML = '';
                        renderCategorySettings(apiPanel, apiSettings);
                    }
                }
                break;
        }
    });

    /**
     * Set up event listeners for UI elements
     */
    function setupEventListeners() {
        // Tab switching
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const category = tab.getAttribute('data-category');
                switchTab(category);
            });
        });

        // Reset all settings
        resetAllBtn.addEventListener('click', () => {
            const confirmed = confirm('Are you sure you want to reset all settings to their default values?');
            if (confirmed) {
                vscode.postMessage({ command: 'resetAllSettings' });
                showNotification('All settings have been reset to defaults', 'success');
            }
        });

        // Search functionality
        searchInput.addEventListener('input', debounce(() => {
            const searchTerm = searchInput.value.trim().toLowerCase();
            if (searchTerm) {
                clearSearchBtn.classList.add('visible');
                searchSettings(searchTerm);
            } else {
                clearSearchBtn.classList.remove('visible');
                clearSearch();
            }
        }, 300));

        // Clear search
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearSearchBtn.classList.remove('visible');
            clearSearch();
            searchInput.focus();
        });

        // Set up copy buttons (including dynamically added ones)
        document.addEventListener('click', (e) => {
            if (e.target.closest('.copy-button')) {
                const button = e.target.closest('.copy-button');
                const textToCopy = button.getAttribute('data-text');
                if (textToCopy) {
                    copyToClipboard(textToCopy, button);
                }
            }
        });
    }

    /**
     * Copy text to clipboard and show feedback
     * @param {string} text - Text to copy
     * @param {HTMLElement} button - The button that was clicked
     */
    function copyToClipboard(text, button) {
        // Copy to clipboard
        navigator.clipboard.writeText(text).then(() => {
            // Show success feedback on the button
            const originalIcon = button.innerHTML;
            button.innerHTML = '<span class="codicon codicon-check"></span>';
            button.classList.add('copied');

            // Show notification
            showNotification('Copied to clipboard', 'success');

            // Reset button after a delay
            setTimeout(() => {
                button.innerHTML = originalIcon;
                button.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showNotification('Failed to copy to clipboard', 'error');
        });
    }

    /**
     * Switch to a different settings tab
     * @param {string} category - The category to switch to
     */
    function switchTab(category) {
        // Update active tab
        tabs.forEach(tab => {
            if (tab.getAttribute('data-category') === category) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // Update active panel
        panels.forEach(panel => {
            if (panel.id === category) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });
    }

    /**
     * Render all settings in their respective panels
     */
    function renderSettings() {
        // Clear existing settings
        panels.forEach(panel => {
            panel.innerHTML = '';
        });

        // Group settings by category
        const settingsByCategory = {};

        // Use the metadata from settingsData
        for (const [key, data] of Object.entries(settingsData)) {
            const category = data.category || 'General';

            if (!settingsByCategory[category]) {
                settingsByCategory[category] = [];
            }

            settingsByCategory[category].push({
                key,
                value: data.value,
                ...data
            });
        }

        // Render each category
        for (const [category, categorySettings] of Object.entries(settingsByCategory)) {
            const panel = document.getElementById(category);
            if (panel) {
                renderCategorySettings(panel, categorySettings);
            }
        }

        // Update dependent settings visibility
        updateDependentSettings();
    }

    /**
     * Render settings for a specific category
     * @param {HTMLElement} panel - The panel element
     * @param {Array} categorySettings - The settings for this category
     */
    function renderCategorySettings(panel, categorySettings) {
        // Create sections based on setting types
        const sections = {
            'Behavior': categorySettings.filter(s =>
                s.key.includes('enable') ||
                s.key.includes('show') ||
                s.key.includes('respect')
            ),
            'Configuration': categorySettings.filter(s =>
                !s.key.includes('enable') &&
                !s.key.includes('show') &&
                !s.key.includes('respect') &&
                s.type !== 'array'
            ),
            'Advanced': categorySettings.filter(s =>
                s.type === 'array'
            )
        };

        // Remove empty sections
        Object.keys(sections).forEach(sectionName => {
            if (sections[sectionName].length === 0) {
                delete sections[sectionName];
            }
        });

        // If no sections, just render all settings
        if (Object.keys(sections).length === 0) {
            renderSettingsList(panel, categorySettings);
            return;
        }

        // Render each section
        for (const [sectionName, sectionSettings] of Object.entries(sections)) {
            if (sectionSettings.length > 0) {
                const section = document.createElement('div');
                section.className = 'settings-section';

                const title = document.createElement('h2');
                title.className = 'settings-section-title';
                title.textContent = sectionName;
                section.appendChild(title);

                renderSettingsList(section, sectionSettings);
                panel.appendChild(section);
            }
        }

        // Add MCP server info box if we're in the MCP Server category and the server is enabled
        if (panel.id === 'MCP Server' && settings.enableMcpServer === true) {
            const mcpPort = settings.mcpPort || 45679;
            const infoBox = document.createElement('div');
            infoBox.className = 'info-box';
            infoBox.innerHTML = `
                <div class="info-box-header">
                    <span class="codicon codicon-info"></span>
                    <span>MCP Server Information</span>
                </div>
                <div class="info-box-content">
                    <p>The MCP (Model Context Protocol) SSE server is now running at:</p>
                    <div class="code-block-container">
                        <div class="code-block">http://localhost:${mcpPort}/sse</div>
                        <button class="copy-button" data-text="http://localhost:${mcpPort}/sse" title="Copy to clipboard">
                            <span class="codicon codicon-copy"></span>
                        </button>
                    </div>
                    <p>To connect to this server from AI tools or applications:</p>
                    <ol>
                        <li>Use the URL above as the SSE endpoint</li>
                        <li>The server provides snapshot functionality through the MCP protocol</li>
                        <li>Available tools: <code>takeNamedSnapshot</code></li>
                    </ol>
                </div>
            `;
            panel.appendChild(infoBox);
        }

        // Add API server info box if we're in the API Server category and the server is enabled
        if (panel.id === 'API Server' && settings.enableApiServer === true) {
            const apiPort = settings.apiPort || 45678;
            const infoBox = document.createElement('div');
            infoBox.className = 'info-box';
            infoBox.innerHTML = `
                <div class="info-box-header">
                    <span class="codicon codicon-info"></span>
                    <span>API Server Information</span>
                </div>
                <div class="info-box-content">
                    <p>The REST API server is now running at:</p>
                    <div class="code-block-container">
                        <div class="code-block">http://localhost:${apiPort}</div>
                        <button class="copy-button" data-text="http://localhost:${apiPort}" title="Copy to clipboard">
                            <span class="codicon codicon-copy"></span>
                        </button>
                    </div>
                    <p>Available endpoints:</p>
                    <ul>
                        <li><code>POST /snapshot</code> - Create a new snapshot</li>
                        <li><code>GET /snapshots</code> - List all snapshots</li>
                    </ul>
                    <p>Example usage with PowerShell:</p>
                    <div class="code-block-container">
                        <div class="code-block">Invoke-RestMethod -Method Post -Uri "http://localhost:${apiPort}/snapshot" -Body (@{name="My API Snapshot"} | ConvertTo-Json) -ContentType "application/json"</div>
                        <button class="copy-button" data-text="Invoke-RestMethod -Method Post -Uri \"http://localhost:${apiPort}/snapshot\" -Body (@{name=\"My API Snapshot\"} | ConvertTo-Json) -ContentType \"application/json\"" title="Copy to clipboard">
                            <span class="codicon codicon-copy"></span>
                        </button>
                    </div>
                    <p>Example usage with curl:</p>
                    <div class="code-block-container">
                        <div class="code-block">curl -X POST http://localhost:${apiPort}/snapshot -H "Content-Type: application/json" -d "{\"name\":\"My API Snapshot\"}"</div>
                        <button class="copy-button" data-text="curl -X POST http://localhost:${apiPort}/snapshot -H \"Content-Type: application/json\" -d \"{\\\"name\\\":\\\"My API Snapshot\\\"}\"" title="Copy to clipboard">
                            <span class="codicon codicon-copy"></span>
                        </button>
                    </div>
                </div>
            `;
            panel.appendChild(infoBox);
        }
    }

    /**
     * Render a list of settings
     * @param {HTMLElement} container - The container element
     * @param {Array} settingsList - The settings to render
     */
    function renderSettingsList(container, settingsList) {
        settingsList.forEach(setting => {
            const settingElement = createSettingElement(setting);
            container.appendChild(settingElement);
        });
    }

    /**
     * Create an element for a single setting
     * @param {Object} setting - The setting to render
     * @returns {HTMLElement} - The setting element
     */
    function createSettingElement(setting) {
        const settingItem = document.createElement('div');
        settingItem.className = 'setting-item';
        settingItem.setAttribute('data-key', setting.key);

        if (setting.dependsOn) {
            settingItem.classList.add('dependent');
            settingItem.setAttribute('data-depends-on', setting.dependsOn);
        }

        // Setting header
        const header = document.createElement('div');
        header.className = 'setting-header';

        // Title and description
        const info = document.createElement('div');

        const title = document.createElement('div');
        title.className = 'setting-title';
        title.textContent = formatSettingName(setting.key);
        info.appendChild(title);

        const description = document.createElement('div');
        description.className = 'setting-description';
        description.textContent = setting.description || '';
        info.appendChild(description);

        header.appendChild(info);

        // Reset button
        const actions = document.createElement('div');
        actions.className = 'setting-actions';

        const resetBtn = document.createElement('button');
        resetBtn.className = 'setting-reset';
        resetBtn.title = 'Reset to default';
        resetBtn.innerHTML = '<span class="codicon codicon-discard"></span>';
        resetBtn.addEventListener('click', () => {
            vscode.postMessage({
                command: 'resetSetting',
                key: setting.key
            });
        });
        actions.appendChild(resetBtn);

        header.appendChild(actions);
        settingItem.appendChild(header);

        // Setting control
        const control = document.createElement('div');
        control.className = 'setting-control';

        // Create the appropriate input based on setting type
        switch (setting.type) {
            case 'boolean':
                control.appendChild(createBooleanControl(setting));
                break;

            case 'number':
                control.appendChild(createNumberControl(setting));
                break;

            case 'string':
                if (setting.enum) {
                    control.appendChild(createEnumControl(setting));
                } else {
                    control.appendChild(createTextControl(setting));
                }
                break;

            case 'array':
                control.appendChild(createArrayControl(setting));
                break;

            default:
                const unsupported = document.createElement('span');
                unsupported.textContent = `Unsupported type: ${setting.type}`;
                control.appendChild(unsupported);
        }

        settingItem.appendChild(control);
        return settingItem;
    }

    /**
     * Create a boolean toggle control
     * @param {Object} setting - The setting to create a control for
     * @returns {HTMLElement} - The control element
     */
    function createBooleanControl(setting) {
        const label = document.createElement('label');
        label.className = 'setting-checkbox';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = setting.value === true;
        input.setAttribute('data-key', setting.key);

        // Special handling for server settings
        if (setting.key === 'enableApiServer' || setting.key === 'enableMcpServer') {
            input.addEventListener('change', () => {
                // If enabling, show a loading state
                if (input.checked) {
                    // Disable the input while the server is starting
                    input.disabled = true;
                    const settingItem = input.closest('.setting-item');
                    if (settingItem) {
                        settingItem.classList.add('loading');
                    }

                    // Show a loading notification
                    showNotification(`Starting ${setting.key === 'enableApiServer' ? 'API' : 'MCP'} server...`, 'info');
                }

                // Send the message to update the setting
                vscode.postMessage({
                    command: 'updateSetting',
                    key: setting.key,
                    value: input.checked
                });
            });
        } else {
            // Normal boolean setting
            input.addEventListener('change', () => {
                vscode.postMessage({
                    command: 'updateSetting',
                    key: setting.key,
                    value: input.checked
                });
            });
        }

        const slider = document.createElement('span');
        slider.className = 'setting-checkbox-slider';

        label.appendChild(input);
        label.appendChild(slider);

        return label;
    }

    /**
     * Create a number input control
     * @param {Object} setting - The setting to create a control for
     * @returns {HTMLElement} - The control element
     */
    function createNumberControl(setting) {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'setting-input';
        input.value = setting.value !== undefined ? setting.value.toString() : '';

        if (setting.minimum !== undefined) {
            input.min = setting.minimum.toString();
        }

        if (setting.maximum !== undefined) {
            input.max = setting.maximum.toString();
        }

        input.addEventListener('change', () => {
            const value = parseInt(input.value, 10);
            if (!isNaN(value)) {
                vscode.postMessage({
                    command: 'updateSetting',
                    key: setting.key,
                    value: value
                });
            }
        });

        return input;
    }

    /**
     * Create a text input control
     * @param {Object} setting - The setting to create a control for
     * @returns {HTMLElement} - The control element
     */
    function createTextControl(setting) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'setting-input';
        input.value = setting.value !== undefined ? setting.value.toString() : '';

        input.addEventListener('change', () => {
            vscode.postMessage({
                command: 'updateSetting',
                key: setting.key,
                value: input.value
            });
        });

        return input;
    }

    /**
     * Create a dropdown control for enum settings
     * @param {Object} setting - The setting to create a control for
     * @returns {HTMLElement} - The control element
     */
    function createEnumControl(setting) {
        const select = document.createElement('select');
        select.className = 'setting-select';

        setting.enum.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = formatEnumOption(option);
            optionElement.selected = setting.value === option;
            select.appendChild(optionElement);
        });

        select.addEventListener('change', () => {
            vscode.postMessage({
                command: 'updateSetting',
                key: setting.key,
                value: select.value
            });
        });

        return select;
    }

    /**
     * Create a control for array settings
     * @param {Object} setting - The setting to create a control for
     * @returns {HTMLElement} - The control element
     */
    function createArrayControl(setting) {
        const container = document.createElement('div');
        container.className = 'setting-array';

        // Current items
        const items = setting.value || [];
        items.forEach((item, index) => {
            container.appendChild(createArrayItem(setting, item, index));
        });

        // Add button
        const addButton = document.createElement('button');
        addButton.className = 'array-add';
        addButton.innerHTML = '<span class="codicon codicon-add"></span> Add Item';
        addButton.addEventListener('click', () => {
            const newItems = [...items, ''];
            vscode.postMessage({
                command: 'updateSetting',
                key: setting.key,
                value: newItems
            });
        });

        container.appendChild(addButton);
        return container;
    }

    /**
     * Create a single array item control
     * @param {Object} setting - The parent setting
     * @param {string} value - The item value
     * @param {number} index - The item index
     * @returns {HTMLElement} - The array item element
     */
    function createArrayItem(setting, value, index) {
        const item = document.createElement('div');
        item.className = 'array-item';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'setting-input array-item-input';
        input.value = value;
        input.addEventListener('change', () => {
            const newItems = [...(setting.value || [])];
            newItems[index] = input.value;
            vscode.postMessage({
                command: 'updateSetting',
                key: setting.key,
                value: newItems
            });
        });

        const removeButton = document.createElement('button');
        removeButton.className = 'array-item-remove';
        removeButton.innerHTML = '<span class="codicon codicon-trash"></span>';
        removeButton.addEventListener('click', () => {
            const newItems = [...(setting.value || [])];
            newItems.splice(index, 1);
            vscode.postMessage({
                command: 'updateSetting',
                key: setting.key,
                value: newItems
            });
        });

        item.appendChild(input);
        item.appendChild(removeButton);
        return item;
    }

    /**
     * Update the visibility of dependent settings
     */
    function updateDependentSettings() {
        const dependentSettings = document.querySelectorAll('.setting-item[data-depends-on]');

        dependentSettings.forEach(settingElement => {
            const dependsOn = settingElement.getAttribute('data-depends-on');
            const parentValue = settings[dependsOn];

            if (parentValue === true) {
                settingElement.classList.remove('disabled');
            } else {
                settingElement.classList.add('disabled');
            }
        });
    }

    /**
     * Format a setting key into a readable name
     * @param {string} key - The setting key
     * @returns {string} - The formatted name
     */
    function formatSettingName(key) {
        // Remove the prefix if present
        let name = key;

        // Split by camelCase and capitalize each word
        return name
            .replace(/([A-Z])/g, ' $1') // Insert a space before all capital letters
            .replace(/^./, str => str.toUpperCase()) // Capitalize the first letter
            .trim();
    }

    /**
     * Format an enum option into a readable name
     * @param {string} option - The enum option
     * @returns {string} - The formatted option
     */
    function formatEnumOption(option) {
        return option
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    /**
     * Get metadata for a setting
     * @param {string} key - The setting key
     * @returns {Object|null} - The setting metadata
     */
    function getSettingMetadata(key) {
        // Now we get metadata directly from settingsData
        return settingsData[key] || {
            type: typeof settings[key],
            key: key
        };
    }

    /**
     * Hide the loading indicator
     */
    function hideLoading() {
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }

    /**
     * Search for settings matching the search term
     * @param {string} searchTerm - The search term
     */
    function searchSettings(searchTerm) {
        // Show all panels during search
        panels.forEach(panel => {
            panel.classList.add('active');
        });

        // Deactivate all tabs
        tabs.forEach(tab => {
            tab.classList.remove('active');
        });

        let hasMatches = false;
        const allSettingItems = document.querySelectorAll('.setting-item');

        allSettingItems.forEach(item => {
            const key = item.getAttribute('data-key');
            const settingData = settingsData[key];

            if (!settingData) return;

            const title = formatSettingName(key).toLowerCase();
            const description = (settingData.description || '').toLowerCase();
            const value = String(settingData.value || '').toLowerCase();

            // Check if the setting matches the search term
            const matches =
                title.includes(searchTerm) ||
                description.includes(searchTerm) ||
                value.includes(searchTerm);

            if (matches) {
                item.classList.add('search-match');
                item.classList.remove('search-hidden');
                hasMatches = true;

                // Highlight matching text
                highlightMatches(item, searchTerm);
            } else {
                item.classList.remove('search-match');
                item.classList.add('search-hidden');
            }
        });

        // Show a message if no matches found
        panels.forEach(panel => {
            const visibleItems = panel.querySelectorAll('.setting-item:not(.search-hidden)');
            if (visibleItems.length === 0) {
                panel.classList.add('search-hidden');
            } else {
                panel.classList.remove('search-hidden');
            }
        });

        if (!hasMatches) {
            showNotification(`No settings found matching "${searchTerm}"`, 'info');
        }
    }

    /**
     * Highlight matching text in the setting item
     * @param {HTMLElement} item - The setting item element
     * @param {string} searchTerm - The search term to highlight
     */
    function highlightMatches(item, searchTerm) {
        // Remove existing highlights
        const existingHighlights = item.querySelectorAll('.search-highlight');
        existingHighlights.forEach(el => {
            const parent = el.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(el.textContent || ''), el);
                parent.normalize();
            }
        });

        // Highlight in title and description
        const titleEl = item.querySelector('.setting-title');
        const descEl = item.querySelector('.setting-description');

        if (titleEl) highlightText(titleEl, searchTerm);
        if (descEl) highlightText(descEl, searchTerm);
    }

    /**
     * Highlight occurrences of a search term in a text node
     * @param {HTMLElement} element - The element containing text
     * @param {string} searchTerm - The search term to highlight
     */
    function highlightText(element, searchTerm) {
        const text = element.textContent || '';
        const lowerText = text.toLowerCase();
        const searchTermLower = searchTerm.toLowerCase();

        if (!lowerText.includes(searchTermLower)) return;

        const parts = [];
        let lastIndex = 0;
        let index = lowerText.indexOf(searchTermLower);

        while (index !== -1) {
            // Add text before match
            if (index > lastIndex) {
                parts.push(document.createTextNode(text.substring(lastIndex, index)));
            }

            // Add highlighted match
            const highlight = document.createElement('span');
            highlight.className = 'search-highlight';
            highlight.textContent = text.substring(index, index + searchTerm.length);
            parts.push(highlight);

            lastIndex = index + searchTerm.length;
            index = lowerText.indexOf(searchTermLower, lastIndex);
        }

        // Add remaining text
        if (lastIndex < text.length) {
            parts.push(document.createTextNode(text.substring(lastIndex)));
        }

        // Replace element content with highlighted version
        element.innerHTML = '';
        parts.forEach(part => element.appendChild(part));
    }

    /**
     * Clear search and restore normal view
     */
    function clearSearch() {
        // Restore tab view
        panels.forEach(panel => {
            panel.classList.remove('active');
            panel.classList.remove('search-hidden');
        });

        // Activate the first tab
        const firstTab = tabs[0];
        if (firstTab) {
            const category = firstTab.getAttribute('data-category');
            switchTab(category);
        }

        // Show all setting items
        const allSettingItems = document.querySelectorAll('.setting-item');
        allSettingItems.forEach(item => {
            item.classList.remove('search-match');
            item.classList.remove('search-hidden');

            // Remove highlights
            const highlights = item.querySelectorAll('.search-highlight');
            highlights.forEach(el => {
                const parent = el.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(el.textContent || ''), el);
                    parent.normalize();
                }
            });
        });
    }

    /**
     * Debounce a function to limit how often it can be called
     * @param {Function} func - The function to debounce
     * @param {number} wait - The debounce delay in milliseconds
     * @returns {Function} - The debounced function
     */
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    /**
     * Show a notification message
     * @param {string} message - The message to show
     * @param {string} type - The notification type (success, error, info)
     */
    function showNotification(message, type = 'info') {
        // Check if notification container exists
        let container = document.querySelector('.notification-container');

        // Create container if it doesn't exist
        if (!container) {
            container = document.createElement('div');
            container.className = 'notification-container';
            document.body.appendChild(container);
        }

        // Create notification
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;

        // Add icon based on type
        let icon = 'info';
        if (type === 'success') icon = 'check';
        if (type === 'error') icon = 'error';

        notification.innerHTML = `
            <span class="codicon codicon-${icon}"></span>
            <span class="notification-message">${message}</span>
        `;

        // Add to container
        container.appendChild(notification);

        // Remove after delay
        setTimeout(() => {
            notification.classList.add('notification-hide');
            setTimeout(() => {
                notification.remove();

                // Remove container if empty
                if (container.children.length === 0) {
                    container.remove();
                }
            }, 300);
        }, 3000);
    }
})();

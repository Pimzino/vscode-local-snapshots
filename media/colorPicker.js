// @ts-check
/// <reference path="./colorPicker.d.ts" />

/**
 * A lightweight color picker implementation for the diff view
 * Based on the HSL color model for intuitive color selection
 * @implements {ColorPicker}
 */
class ColorPicker {
    /**
     * @param {string} initialColor - Initial color in hex format (e.g., #FFD700)
     * @param {(color: string) => void} onChange - Callback when color changes
     * @param {boolean} realTimeUpdates - Whether to update in real-time during color selection
     */
    constructor(initialColor, onChange, realTimeUpdates = true) {
        this.color = this.hexToHsl(initialColor);
        this.onChange = onChange;
        this.element = null;
        this.isOpen = false;
        this.dragging = false;
        this.hueSliderDragging = false;
        this.realTimeUpdates = realTimeUpdates;
        this.lastUpdateTime = 0;
    }

    /**
     * Creates the color picker UI
     * @returns {HTMLElement} The color picker container element
     */
    create() {
        // Create container
        const container = document.createElement('div');
        container.className = 'color-picker-container';

        // Create color preview button
        const previewButton = document.createElement('button');
        previewButton.className = 'color-preview-button';
        previewButton.style.backgroundColor = this.hslToHex(this.color);
        previewButton.setAttribute('title', 'Change highlight color');
        previewButton.innerHTML = '<span class="codicon codicon-symbol-color"></span>';

        // Create popup
        const popup = document.createElement('div');
        popup.className = 'color-picker-popup';
        popup.style.display = 'none';

        // Create color area (saturation/lightness)
        const colorArea = document.createElement('div');
        colorArea.className = 'color-area';
        colorArea.style.backgroundColor = `hsl(${this.color.h}, 100%, 50%)`;

        // Create color area pointer
        const colorAreaPointer = document.createElement('div');
        colorAreaPointer.className = 'color-area-pointer';
        colorAreaPointer.style.left = `${this.color.s}%`;
        colorAreaPointer.style.top = `${100 - this.color.l}%`;
        colorArea.appendChild(colorAreaPointer);

        // Create hue slider
        const hueSlider = document.createElement('div');
        hueSlider.className = 'hue-slider';

        // Create hue slider thumb
        const hueSliderThumb = document.createElement('div');
        hueSliderThumb.className = 'hue-slider-thumb';
        hueSliderThumb.style.left = `${(this.color.h / 360) * 100}%`;
        hueSlider.appendChild(hueSliderThumb);

        // Create hex input
        const hexContainer = document.createElement('div');
        hexContainer.className = 'hex-container';

        const hexLabel = document.createElement('label');
        hexLabel.textContent = 'Hex:';

        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'hex-input';
        hexInput.value = this.hslToHex(this.color);

        hexContainer.appendChild(hexLabel);
        hexContainer.appendChild(hexInput);

        // Create preset colors
        const presets = document.createElement('div');
        presets.className = 'color-presets';

        const presetColors = [
            '#FFD700', // Gold (default)
            '#FF5733', // Coral
            '#33FF57', // Lime
            '#3357FF', // Blue
            '#F033FF', // Magenta
            '#FF33F0', // Pink
            '#33FFF0', // Cyan
            '#FFFFFF', // White
        ];

        presetColors.forEach(color => {
            const preset = document.createElement('button');
            preset.className = 'color-preset';
            preset.style.backgroundColor = color;
            preset.setAttribute('title', color);
            preset.addEventListener('click', () => {
                this.setColorFromHex(color);
                hexInput.value = color;
                this.updateUI();
                this.onChange(color);
            });
            presets.appendChild(preset);
        });

        // Add elements to popup
        popup.appendChild(colorArea);
        popup.appendChild(hueSlider);
        popup.appendChild(hexContainer);
        popup.appendChild(presets);

        // Add elements to container
        container.appendChild(previewButton);
        container.appendChild(popup);

        // Event listeners
        previewButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePopup();
        });

        // Color area events
        colorArea.addEventListener('mousedown', (e) => {
            this.handleColorAreaMouseDown(e, colorArea, colorAreaPointer);
        });

        document.addEventListener('mousemove', (e) => {
            if (this.dragging) {
                this.handleColorAreaMouseMove(e, colorArea, colorAreaPointer);
            }
            if (this.hueSliderDragging) {
                this.handleHueSliderMouseMove(e, hueSlider, hueSliderThumb, colorArea);
            }
        });

        document.addEventListener('mouseup', () => {
            this.dragging = false;
            this.hueSliderDragging = false;
        });

        // Hue slider events
        hueSlider.addEventListener('mousedown', (e) => {
            this.handleHueSliderMouseDown(e, hueSlider, hueSliderThumb, colorArea);
        });

        // Hex input events
        hexInput.addEventListener('change', () => {
            let value = hexInput.value;
            if (!value.startsWith('#')) {
                value = '#' + value;
            }
            if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                this.setColorFromHex(value);
                this.updateUI();
                this.onChange(value);
            } else {
                hexInput.value = this.hslToHex(this.color);
            }
        });

        // Close popup when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !container.contains(e.target)) {
                this.closePopup();
            }
        });

        this.element = container;
        return container;
    }

    /**
     * Toggles the color picker popup
     */
    togglePopup() {
        const popup = this.element.querySelector('.color-picker-popup');
        if (popup) {
            if (this.isOpen) {
                this.closePopup();
            } else {
                popup.style.display = 'block';
                this.isOpen = true;
            }
        }
    }

    /**
     * Closes the color picker popup
     */
    closePopup() {
        const popup = this.element.querySelector('.color-picker-popup');
        if (popup) {
            popup.style.display = 'none';
            this.isOpen = false;
        }
    }

    /**
     * Handles mouse down on the color area
     * @param {MouseEvent} e - Mouse event
     * @param {HTMLElement} colorArea - Color area element
     * @param {HTMLElement} pointer - Color area pointer element
     */
    handleColorAreaMouseDown(e, colorArea, pointer) {
        this.dragging = true;
        this.handleColorAreaMouseMove(e, colorArea, pointer);
    }

    /**
     * Handles mouse move on the color area
     * @param {MouseEvent} e - Mouse event
     * @param {HTMLElement} colorArea - Color area element
     * @param {HTMLElement} pointer - Color area pointer element
     */
    handleColorAreaMouseMove(e, colorArea, pointer) {
        if (!this.dragging) return;

        const rect = colorArea.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        // Constrain to color area
        x = Math.max(0, Math.min(x, rect.width));
        y = Math.max(0, Math.min(y, rect.height));

        // Calculate saturation and lightness
        const s = (x / rect.width) * 100;
        const l = 100 - (y / rect.height) * 100;

        // Update color
        this.color.s = s;
        this.color.l = l;

        // Update pointer position
        pointer.style.left = `${s}%`;
        pointer.style.top = `${100 - l}%`;

        // Update hex input
        const hexInput = this.element.querySelector('.hex-input');
        if (hexInput) {
            hexInput.value = this.hslToHex(this.color);
        }

        // Call onChange callback with throttling for real-time updates
        const currentTime = Date.now();
        if (this.realTimeUpdates || currentTime - this.lastUpdateTime > 100) {
            this.onChange(this.hslToHex(this.color));
            this.lastUpdateTime = currentTime;
        }
    }

    /**
     * Handles mouse down on the hue slider
     * @param {MouseEvent} e - Mouse event
     * @param {HTMLElement} slider - Hue slider element
     * @param {HTMLElement} thumb - Hue slider thumb element
     * @param {HTMLElement} colorArea - Color area element
     */
    handleHueSliderMouseDown(e, slider, thumb, colorArea) {
        this.hueSliderDragging = true;
        this.handleHueSliderMouseMove(e, slider, thumb, colorArea);
    }

    /**
     * Handles mouse move on the hue slider
     * @param {MouseEvent} e - Mouse event
     * @param {HTMLElement} slider - Hue slider element
     * @param {HTMLElement} thumb - Hue slider thumb element
     * @param {HTMLElement} colorArea - Color area element
     */
    handleHueSliderMouseMove(e, slider, thumb, colorArea) {
        if (!this.hueSliderDragging) return;

        const rect = slider.getBoundingClientRect();
        let x = e.clientX - rect.left;

        // Constrain to slider
        x = Math.max(0, Math.min(x, rect.width));

        // Calculate hue
        const hue = (x / rect.width) * 360;

        // Update color
        this.color.h = hue;

        // Update thumb position
        thumb.style.left = `${(hue / 360) * 100}%`;

        // Update color area background
        colorArea.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;

        // Update hex input
        const hexInput = this.element.querySelector('.hex-input');
        if (hexInput) {
            hexInput.value = this.hslToHex(this.color);
        }

        // Call onChange callback with throttling for real-time updates
        const currentTime = Date.now();
        if (this.realTimeUpdates || currentTime - this.lastUpdateTime > 100) {
            this.onChange(this.hslToHex(this.color));
            this.lastUpdateTime = currentTime;
        }
    }

    /**
     * Updates the UI to reflect the current color
     */
    updateUI() {
        if (!this.element) return;

        const previewButton = this.element.querySelector('.color-preview-button');
        const colorArea = this.element.querySelector('.color-area');
        const colorAreaPointer = this.element.querySelector('.color-area-pointer');
        const hueSliderThumb = this.element.querySelector('.hue-slider-thumb');
        const hexInput = this.element.querySelector('.hex-input');

        if (previewButton) {
            previewButton.style.backgroundColor = this.hslToHex(this.color);
        }

        if (colorArea) {
            colorArea.style.backgroundColor = `hsl(${this.color.h}, 100%, 50%)`;
        }

        if (colorAreaPointer) {
            colorAreaPointer.style.left = `${this.color.s}%`;
            colorAreaPointer.style.top = `${100 - this.color.l}%`;
        }

        if (hueSliderThumb) {
            hueSliderThumb.style.left = `${(this.color.h / 360) * 100}%`;
        }

        if (hexInput) {
            hexInput.value = this.hslToHex(this.color);
        }
    }

    /**
     * Sets the color from a hex string
     * @param {string} hex - Hex color string
     */
    setColorFromHex(hex) {
        this.color = this.hexToHsl(hex);
    }

    /**
     * Converts a hex color string to HSL
     * @param {string} hex - Hex color string
     * @returns {{ h: number, s: number, l: number }} HSL color object
     */
    hexToHsl(hex) {
        // Remove # if present
        hex = hex.replace(/^#/, '');

        // Parse hex to RGB
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;

        // Find min and max RGB values
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);

        // Calculate lightness
        let h, s, l = (max + min) / 2;

        if (max === min) {
            // Achromatic
            h = s = 0;
        } else {
            // Calculate saturation
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            // Calculate hue
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }

            h /= 6;
        }

        // Convert to degrees, percentage
        return {
            h: h * 360,
            s: s * 100,
            l: l * 100
        };
    }

    /**
     * Converts an HSL color object to a hex string
     * @param {{ h: number, s: number, l: number }} hsl - HSL color object
     * @returns {string} Hex color string
     */
    hslToHex(hsl) {
        const h = hsl.h / 360;
        const s = hsl.s / 100;
        const l = hsl.l / 100;

        let r, g, b;

        if (s === 0) {
            // Achromatic
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        // Convert to hex
        const toHex = x => {
            const hex = Math.round(x * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
}

// Export for use in diffView.js
window.ColorPicker = ColorPicker;

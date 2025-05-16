// @ts-check
/// <reference path="./colorPicker.d.ts" />

/**
 * A reusable color picker component that can be attached to any input field
 */
class ColorPickerComponent {
    /**
     * Creates a new color picker component
     * @param {HTMLInputElement} inputElement - The input element to attach the color picker to
     * @param {(color: string) => void} onChange - Callback when color changes
     * @param {boolean} realTimeUpdates - Whether to update in real-time during color selection
     */
    static create(inputElement, onChange, realTimeUpdates = true) {
        // Create color preview button
        const previewButton = document.createElement('button');
        previewButton.className = 'color-preview-button';
        previewButton.style.backgroundColor = inputElement.value || '#FFFFFF';
        previewButton.setAttribute('title', 'Pick a color');
        previewButton.innerHTML = '<span class="codicon codicon-symbol-color"></span>';
        
        // Insert the button after the input
        inputElement.parentNode.insertBefore(previewButton, inputElement.nextSibling);
        
        // Add input event listener to update the preview button
        inputElement.addEventListener('input', () => {
            let color = inputElement.value;
            if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) {
                previewButton.style.backgroundColor = color;
            }
        });
        
        // Create the color picker when the button is clicked
        previewButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Remove any existing color picker
            const existingPicker = document.querySelector('.color-picker-popup');
            if (existingPicker) {
                existingPicker.remove();
            }
            
            // Create color picker
            const colorPicker = new ColorPicker(inputElement.value || '#FFFFFF', (color) => {
                // Update the input value
                inputElement.value = color;
                
                // Update the preview button
                previewButton.style.backgroundColor = color;
                
                // Trigger the onChange callback
                if (onChange) {
                    onChange(color);
                }
                
                // Trigger the input event on the input element
                const event = new Event('input', { bubbles: true });
                inputElement.dispatchEvent(event);
                
                // Trigger the change event on the input element if not in real-time mode
                if (!realTimeUpdates) {
                    const changeEvent = new Event('change', { bubbles: true });
                    inputElement.dispatchEvent(changeEvent);
                }
            }, realTimeUpdates);
            
            // Create the color picker element
            const colorPickerElement = colorPicker.create();
            
            // Position the popup
            const popup = colorPickerElement.querySelector('.color-picker-popup');
            if (popup) {
                document.body.appendChild(popup);
                
                // Position the popup near the button
                const buttonRect = previewButton.getBoundingClientRect();
                const popupRect = popup.getBoundingClientRect();
                
                // Check if there's enough space below
                const spaceBelow = window.innerHeight - buttonRect.bottom;
                const spaceRight = window.innerWidth - buttonRect.right;
                
                if (spaceBelow >= popupRect.height) {
                    // Position below
                    popup.style.top = `${buttonRect.bottom + window.scrollY}px`;
                } else {
                    // Position above
                    popup.style.top = `${buttonRect.top - popupRect.height + window.scrollY}px`;
                }
                
                if (spaceRight >= popupRect.width) {
                    // Position to the right
                    popup.style.left = `${buttonRect.left + window.scrollX}px`;
                } else {
                    // Position to the left
                    popup.style.left = `${buttonRect.right - popupRect.width + window.scrollX}px`;
                }
                
                popup.style.display = 'block';
                
                // Close popup when clicking outside
                const closeHandler = (e) => {
                    if (!popup.contains(e.target) && e.target !== previewButton) {
                        popup.remove();
                        document.removeEventListener('click', closeHandler);
                    }
                };
                
                // Add a small delay before adding the click handler
                setTimeout(() => {
                    document.addEventListener('click', closeHandler);
                }, 100);
            }
        });
        
        return previewButton;
    }
}

// Export for use in other files
window.ColorPickerComponent = ColorPickerComponent;

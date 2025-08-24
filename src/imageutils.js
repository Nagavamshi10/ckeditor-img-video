/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */
import { Plugin } from 'ckeditor5/src/core.js';
import { findOptimalInsertionRange, isWidget, toWidget } from 'ckeditor5/src/widget.js';
import { determineImageTypeForInsertionAtSelection } from './image/utils.js';
import { DomEmitterMixin, global } from 'ckeditor5/src/utils.js';
const IMAGE_WIDGETS_CLASSES_MATCH_REGEXP = /^(image|image-inline)$/;
/**
 * A set of helpers related to images.
 */
export default class ImageUtils extends Plugin {
    constructor() {
        super(...arguments);
        /**
         * DOM Emitter.
         */
        this._domEmitter = new (DomEmitterMixin())();
    }
    /**
     * @inheritDoc
     */
    static get pluginName() {
        return 'ImageUtils';
    }
    /**
     * Checks if the provided model element is an `image` or `imageInline`.
     */
    isImage(modelElement) {
        return this.isInlineImage(modelElement) || this.isBlockImage(modelElement);
    }
    /**
     * Checks if the provided view element represents an inline image.
     *
     * Also, see {@link module:image/imageutils~ImageUtils#isImageWidget}.
     */
    isInlineImageView(element) {
        return element?.is('element', 'img') || false;
    }
    /**
     * Checks if the provided view element represents a block image.
     *
     * Also, see {@link module:image/imageutils~ImageUtils#isImageWidget}.
     */
    isBlockImageView(element) {
        return element?.is('element', 'figure') && element.hasClass('image');
    }
    /**
     * Handles inserting single file. This method unifies image insertion using {@link module:widget/utils~findOptimalInsertionRange}
     * method.
     *
     * ```ts
     * const imageUtils = editor.plugins.get( 'ImageUtils' );
     *
     * imageUtils.insertImage( { src: 'path/to/image.jpg' } );
     * ```
     *
     * @param attributes Attributes of the inserted image.
     * This method filters out the attributes which are disallowed by the {@link module:engine/model/schema~Schema}.
     * @param selectable Place to insert the image. If not specified,
     * the {@link module:widget/utils~findOptimalInsertionRange} logic will be applied for the block images
     * and `model.document.selection` for the inline images.
     *
     * **Note**: If `selectable` is passed, this helper will not be able to set selection attributes (such as `linkHref`)
     * and apply them to the new image. In this case, make sure all selection attributes are passed in `attributes`.
     *
     * @param imageType Image type of inserted image. If not specified,
     * it will be determined automatically depending of editor config or place of the insertion.
     * @param options.setImageSizes Specifies whether the image `width` and `height` attributes should be set automatically.
     * The default is `true`.
     * @return The inserted model image element.
     */
    insertImage(attributes = {}, selectable = null, imageType = null, options = {}) {
        const editor = this.editor;
        const model = editor.model;
        const selection = model.document.selection;
        const determinedImageType = determineImageTypeForInsertion(editor, selectable || selection, imageType);
        
        // Prepare attributes efficiently
        const finalAttributes = this._prepareImageAttributes(attributes, selection, determinedImageType);
        
        return model.change(writer => {
            const { setImageSizes = true } = options;
            const imageElement = writer.createElement(determinedImageType, finalAttributes);
            
            model.insertObject(imageElement, selectable, null, {
                setSelection: 'on',
                // If we want to insert a block image (for whatever reason) then we don't want to split text blocks.
                // This applies only when we don't have the selectable specified (i.e., we insert multiple block images at once).
                findOptimalPosition: !selectable && determinedImageType !== 'imageInline' ? 'auto' : undefined
            });
            
            // Inserting an image might've failed due to schema regulations.
            if (imageElement.parent) {
                if (setImageSizes) {
                    this.setImageNaturalSizeAttributes(imageElement);
                }
                return imageElement;
            }
            return null;
        });
    }
    
    /**
     * Prepares and filters image attributes for insertion.
     * 
     * @private
     * @param attributes User provided attributes
     * @param selection Current selection
     * @param imageType Determined image type
     * @return Filtered attributes object
     */
    _prepareImageAttributes(attributes, selection, imageType) {
        const model = this.editor.model;
        
        // Mix declarative attributes with selection attributes because the new image should "inherit"
        // the latter for best UX. For instance, inline images inserted into existing links
        // should not split them. To do that, they need to have "linkHref" inherited from the selection.
        const combinedAttributes = {
            ...Object.fromEntries(selection.getAttributes()),
            ...attributes
        };
        
        // Filter out attributes that are not allowed by the schema
        const filteredAttributes = {};
        for (const attributeName in combinedAttributes) {
            if (model.schema.checkAttribute(imageType, attributeName)) {
                filteredAttributes[attributeName] = combinedAttributes[attributeName];
            }
        }
        
        return filteredAttributes;
    }
    /**
     * Reads original image sizes and sets them as `width` and `height`.
     *
     * The `src` attribute may not be available if the user is using an upload adapter. In such a case,
     * this method is called again after the upload process is complete and the `src` attribute is available.
     */
    setImageNaturalSizeAttributes(imageElement) {
        const src = imageElement.getAttribute('src');
        if (!src) {
            return;
        }
        if (imageElement.getAttribute('width') || imageElement.getAttribute('height')) {
            return;
        }
        
        this.editor.model.change(writer => {
            const img = new global.window.Image();
            let timeoutId;
            
            const cleanup = () => {
                this._domEmitter.stopListening(img, 'load');
                this._domEmitter.stopListening(img, 'error');
                if (timeoutId) {
                    global.window.clearTimeout(timeoutId);
                }
            };
            
            this._domEmitter.listenTo(img, 'load', () => {
                // Double-check that the element still exists and doesn't have dimensions set
                if (imageElement.root && 
                    !imageElement.getAttribute('width') && 
                    !imageElement.getAttribute('height') &&
                    img.naturalWidth > 0 && img.naturalHeight > 0) {
                    
                    // We use writer.batch to be able to undo (in a single step) width and height setting
                    // along with any change that triggered this action (e.g. image resize or image style change).
                    this.editor.model.enqueueChange(writer.batch, writer => {
                        writer.setAttribute('width', img.naturalWidth, imageElement);
                        writer.setAttribute('height', img.naturalHeight, imageElement);
                    });
                }
                cleanup();
            });
            
            this._domEmitter.listenTo(img, 'error', () => {
                cleanup();
            });
            
            // Add timeout to prevent memory leaks from images that never load
            timeoutId = global.window.setTimeout(() => {
                cleanup();
            }, 10000); // 10 second timeout
            
            img.src = src;
        });
    }
    /**
     * Returns an image widget editing view element if one is selected or is among the selection's ancestors.
     */
    getClosestSelectedImageWidget(selection) {
        if (!selection) {
            return null;
        }
        
        // First check if we have a directly selected image widget
        const viewElement = selection.getSelectedElement();
        if (viewElement && this.isImageWidget(viewElement)) {
            return viewElement;
        }
        
        // Then check ancestors
        const selectionPosition = selection.getFirstPosition();
        if (!selectionPosition) {
            return null;
        }
        
        // Optimize ancestor traversal by using findAncestor with a predicate
        return selectionPosition.findAncestor(element => 
            element.is('element') && this.isImageWidget(element)
        );
    }
    /**
     * Returns a image model element if one is selected or is among the selection's ancestors.
     */
    getClosestSelectedImageElement(selection) {
        if (!selection) {
            return null;
        }
        
        const selectedElement = selection.getSelectedElement();
        if (this.isImage(selectedElement)) {
            return selectedElement;
        }
        
        const firstPosition = selection.getFirstPosition();
        if (!firstPosition) {
            return null;
        }
        
        // Look for both imageBlock and imageInline ancestors
        return firstPosition.findAncestor(element => 
            element && (element.is('element', 'imageBlock') || element.is('element', 'imageInline'))
        );
    }
    /**
     * Returns an image widget editing view based on the passed image view.
     */
    getImageWidgetFromImageView(imageView) {
        return imageView.findAncestor({ classes: IMAGE_WIDGETS_CLASSES_MATCH_REGEXP });
    }
    /**
     * Checks if image can be inserted at current model selection.
     *
     * @internal
     */
    isImageAllowed() {
        const model = this.editor.model;
        const selection = model.document.selection;
        return this._isImageAllowedInParent(selection) && this._isNotInsideImage(selection);
    }
    
    /**
     * Checks if image is allowed by schema in optimal insertion parent.
     * 
     * @private
     * @param selection Current selection
     * @return True if image can be inserted
     */
    _isImageAllowedInParent(selection) {
        const imageType = determineImageTypeForInsertion(this.editor, selection, null);
        
        if (imageType === 'imageBlock') {
            const parent = this._getInsertImageParent(selection);
            return this.editor.model.schema.checkChild(parent, 'imageBlock');
        }
        
        return this.editor.model.schema.checkChild(selection.focus, 'imageInline');
    }
    
    /**
     * Checks if selection is not placed inside an image (e.g. its caption).
     * 
     * @private
     * @param selection Current selection
     * @return True if selection is not inside an image
     */
    _isNotInsideImage(selection) {
        return !selection.focus.findAncestor('imageBlock');
    }
    
    /**
     * Returns a node that will be used to insert image with `model.insertContent`.
     * 
     * @private
     * @param selection Current selection
     * @return Parent element for image insertion
     */
    _getInsertImageParent(selection) {
        const model = this.editor.model;
        const insertionRange = findOptimalInsertionRange(selection, model);
        const parent = insertionRange.start.parent;
        
        if (parent.isEmpty && !parent.is('element', '$root')) {
            return parent.parent;
        }
        
        return parent;
    }
    /**
     * Converts a given {@link module:engine/view/element~Element} to an image widget:
     * * Adds a {@link module:engine/view/element~Element#_setCustomProperty custom property} allowing to recognize the image widget
     * element.
     * * Calls the {@link module:widget/utils~toWidget} function with the proper element's label creator.
     *
     * @param writer An instance of the view writer.
     * @param label The element's label. It will be concatenated with the image `alt` attribute if one is present.
     */
    toImageWidget(viewElement, writer, label) {
        writer.setCustomProperty('image', true, viewElement);
        const labelCreator = () => {
            const imgElement = this.findViewImgElement(viewElement);
            const altText = imgElement.getAttribute('alt');
            return altText ? `${altText} ${label}` : label;
        };
        return toWidget(viewElement, writer, { label: labelCreator });
    }
    /**
     * Checks if a given view element is an image widget.
     */
    isImageWidget(viewElement) {
        return viewElement?.getCustomProperty('image') && isWidget(viewElement);
    }
    /**
     * Checks if the provided model element is an `image`.
     */
    isBlockImage(modelElement) {
        return modelElement?.is('element', 'imageBlock') || false;
    }
    /**
     * Checks if the provided model element is an `imageInline`.
     */
    isInlineImage(modelElement) {
        return modelElement?.is('element', 'imageInline') || false;
    }
    /**
     * Get the view `<img>` from another view element, e.g. a widget (`<figure class="image">`), a link (`<a>`).
     *
     * The `<img>` can be located deep in other elements, so this helper performs a deep tree search.
     */
    findViewImgElement(figureView) {
        if (!figureView) {
            return null;
        }
        
        if (this.isInlineImageView(figureView)) {
            return figureView;
        }
        
        // Optimized search - use recursive approach instead of range iteration for better performance
        return this._findImgElementRecursive(figureView);
    }
    
    /**
     * Recursively searches for an img element within a view element.
     * 
     * @private
     * @param element The element to search in
     * @return The found img element or null
     */
    _findImgElementRecursive(element) {
        if (!element || !element.is('element')) {
            return null;
        }
        
        // Check direct children first for better performance
        for (const child of element.getChildren()) {
            if (this.isInlineImageView(child)) {
                return child;
            }
        }
        
        // Then check nested elements
        for (const child of element.getChildren()) {
            if (child.is('element')) {
                const found = this._findImgElementRecursive(child);
                if (found) {
                    return found;
                }
            }
        }
        
        return null;
    }
    /**
     * @inheritDoc
     */
    destroy() {
        this._domEmitter.stopListening();
        return super.destroy();
    }
}

/**
 * Determine image element type name depending on editor config or place of insertion.
 *
 * @param imageType Image element type name. Used to force return of provided element name,
 * but only if there is proper plugin enabled.
 */
function determineImageTypeForInsertion(editor, selectable, imageType) {
    const schema = editor.model.schema;
    const configImageInsertType = editor.config.get('image.insert.type');
    if (!editor.plugins.has('ImageBlockEditing')) {
        return 'imageInline';
    }
    if (!editor.plugins.has('ImageInlineEditing')) {
        return 'imageBlock';
    }
    if (imageType) {
        return imageType;
    }
    if (configImageInsertType === 'inline') {
        return 'imageInline';
    }
    if (configImageInsertType !== 'auto') {
        return 'imageBlock';
    }
    // Try to replace the selected widget (e.g. another image).
    if (selectable.is('selection')) {
        return determineImageTypeForInsertionAtSelection(schema, selectable);
    }
    return schema.checkChild(selectable, 'imageInline') ? 'imageInline' : 'imageBlock';
}

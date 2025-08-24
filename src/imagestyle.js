/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module image/imagestyle
 */

import { Plugin } from 'ckeditor5/src/core.js';
import ImageStyleEditing from './imagestyle/imagestyleediting.js';
import ImageStyleUI from './imagestyle/imagestyleui.js';

/**
 * The image style plugin.
 *
 * For a detailed overview of the image styles feature, check the {@glink features/images/images-styles documentation}.
 *
 * This is a "glue" plugin which loads the following plugins:
 * * {@link module:image/imagestyle/imagestyleediting~ImageStyleEditing},
 * * {@link module:image/imagestyle/imagestyleui~ImageStyleUI}
 *
 * It provides a default configuration, which can be extended or overwritten.
 * Read more about the {@link module:image/imageconfig~ImageConfig#styles image styles configuration}.
 * 
 * @extends Plugin
 */
export default class ImageStyle extends Plugin {
    /**
     * The list of plugins required by this plugin.
     *
     * @readonly
     * @static
     * @returns {Array<Function>} The array of required plugin constructors.
     */
    static get requires() {
        return [ImageStyleEditing, ImageStyleUI];
    }

    /**
     * The plugin name.
     *
     * @readonly
     * @static
     * @returns {string} The plugin name.
     */
    static get pluginName() {
        return 'ImageStyle';
    }

    /**
     * @inheritDoc
     */
    static get isOfficialPlugin() {
        return true;
    }

    /**
     * @inheritDoc
     */
    init() {
        // Plugin initialization is handled by the required plugins
        // This method is intentionally left empty as this is a glue plugin
    }
}

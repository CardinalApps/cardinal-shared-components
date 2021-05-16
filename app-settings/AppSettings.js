/**
 * This component is designed to be extended by another component. It does not
 * render any HTML on its own.
 * 
 * It provides methods for working with the settings forms, sycning options,
 * handing fields, and more.
 * 
 * It should be extended by `server-settings`, `music-settings`,
 * `photos-settings`, etc. It is up to those extenters to implement displaying
 * the form (in a modal or whatever).
 */
import __ from '../../double-u/index.js'
import i18n from '../../i18n.js/index.js'
import Lowrider from '../../lowrider.js/index.js'
import * as forms from '../../cardinal-forms/index.js'

// logic for individual fields
import * as langLogic from './field-logic/lang.js'

export class AppSettings extends Lowrider {
  constructor() {
    super()
    this.formId = '#app-settings-form'
    this.boundOnDataSettingsAttrClick = this.onDataSettingsAttrClick.bind(this)
    this.onFieldChange = null

    // cache of settings event callbacks
    this._callbacks = {
      'onClose': []
    }
  }

  /**
   * Call this to init all settings fields.
   */
  formSetup() {
    this.watchSyncGroups() // watches for generic changes to the settings form fields
    this.initForm() // inits field listeners for fields with logic imported from submodules
  }

  /**
   * Some fields are too simple to require their own module. Register their events here.
   */
  registerFieldEventListeners() {
    /**
     * When factory reset is clicked
     */
    let resetBtn = __(this).find(`${this.formId} button[name="factory-reset"]`)

    if (resetBtn.els.length) {
      resetBtn.each((btn) => {
        btn.addEventListener('click', (event) => {
          event.preventDefault()
    
          if (confirm(i18n('settings.factory-reset.confirm'))) {
            if (confirm(i18n('danger-confirm'))) {
              Bridge.ipcSay('factory-reset')
            }
          }
        })
      })
    }

    /**
     * When the color theme is switched.
     */
    __(this).find('select[name="color_theme"]').on('change', function() {
      let selectedTheme = __(this).value()
      __('#app').attr('color-theme', selectedTheme)
    })

    /**
     * When a color swatch is clicked.
     */
    __(this).find('.color-swatch').on('click', function() {
      let swatch = __(this)
      let color = swatch.attr('data-color')

      Bridge.ipcAsk('set-option', {
        'option': 'accent_color',
        'value': color
      })
      
      document.documentElement.style.setProperty('--accent-color', color)
    })
  }

  /**
   * Removes event handlers that are registered by submodules
   */
  removeEventHandlers() {
    langLogic.unsubscribe()
  }

  /**
   * Triggered whenever an element with the data-settings attribute is clicked.
   */
  onDataSettingsAttrClick(event) {
    let tabToShow = __(event.target).attr('data-settings')

    if (!event.target.matches('[data-settings]')) {
      tabToShow = __(event.target.closest('[data-settings]')).attr('data-settings')
    }

    this.openSettingsPanel(tabToShow)
  }

  /**
   * There are .field-group's in the settings <form> that have [data-sync-with-db="true"],
   * this function will watch them and sync their changes within the database options table.
   */
  watchSyncGroups() {
    // called when a field is changed
    this.onFieldChange = (event) => {
      let el = event.target
      let optionName = __(el).attr('name')
      let newVal
      
      if (__(el).attr('type') === 'checkbox') {
        newVal = el.checked
      } else {
        newVal = __(el).value()
      }

      Bridge.ipcAsk('set-option', {'option': optionName, 'value': newVal})
    }

    // handler will get attached directly to Elements
    __(`${this.formId} [data-sync-with-db="true"] select`).on('change', this.onFieldChange)
    __(`${this.formId} [data-sync-with-db="true"] input`).on('change', this.onFieldChange)
    __(`${this.formId} [data-sync-with-db="true"] textarea`).on('change', this.onFieldChange)
  }

  /**
   * Sets the values for the inputs within [data-sync-with-db="true"] upon modal load
   */
  setSyncGroups() {
    __(`${this.formId} [data-sync-with-db="true"]`)
    .find('select, input, textarea')
    .each(async (el) => {
      let optionName = __(el).attr('name')
      let optionValue = await Bridge.ipcAsk('get-option', optionName)

      if (el.matches('[type="checkbox"]')) {
        if (optionValue === 1) {
          el.checked = true
        } else if (optionValue === 0) {
          el.checked = false
        }
      } else {
        __(el).value(optionValue)
      }
    })
  }

  /**
   * Visually shows the settings panel to the user.
   * 
   * @param {string} tabToShow - The name of the tab to show on init. Defaults to the last open tab, or the first tab.
   */
  openSettingsPanel(tabToShow) {
    // if it's already open, do nothing
    if (__('.settings-panel').hasClass('open')) return

    __('#app').addClass('settings-open')
    __('.settings-panel').addClass('open')

    if (!tabToShow) {
      let lastUsedTab = __(this.tabs.selector).attr('data-current-tab')
      
      if (lastUsedTab) {
        tabToShow = lastUsedTab
      }
    }

    this.tabs.showTab(tabToShow)

    __().keepFocusWithin('.settings-panel')
  }

  /**
   * Right before the modal animates in, init all of the field groups.
   */
  initForm() {
    forms.prepare(this.querySelector(this.formId))
    this.setSyncGroups()
    langLogic.subscribe()
    this.registerFieldEventListeners()

    // block form submission which would reload the page
    __(this.formId).on('submit', (event) => {
      event.preventDefault()
    })
  }

  /**
   * Allows other custom elements to register a callback with the settings.
   * 
   * @param {string} event - The event type. Supports `onClose`.
   */
  registerCallback(event, cb) {
    this._callbacks[event].push(cb)
  }
}
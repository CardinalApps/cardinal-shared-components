/**
 * @file
 * 
 * This custom element implements the entire settings modal with all of its contents.
 * 
 * The <music-settings> element is included in the initial HTML. It is a singleton
 * that handles everything from hooking into other elements to create "Settings" menu
 * items to invoking the settings panel modal.
 */
import __ from '../../../node_modules/double-u/index.js'
import { html } from '../../../node_modules/html.js/index.js'
import i18n from '../../../node_modules/i18n.js/index.js'
import Tabs from '../../tabs/Tabs.js'
import Lowrider from '../../../node_modules/lowrider.js/index.js'
import * as forms from '../../forms.js'

// logic for individual fields
import * as langLogic from './field-logic/lang.js'

export class MusicSettings extends Lowrider {
  /**
   * When an instance of the element is created in the DOM.
   */
  async onSpawn() {
    if (__().enforceSingleton('music-settings', this)) return

    this.boundOnDataSettingsAttrClick = this.onDataSettingsAttrClick.bind(this)
    this.boundEscKeyHandler = this.onEscKey.bind(this)
    this.onFieldChange = null

    // cache of settings event callbacks
    this._callbacks = {
      'onClose': []
    }
  }

  /**
   * Builds the inner HTML
   */
  async onBuild() {
    this.innerHTML = await html('/elements/music-settings/music-settings.html')
  }

  /**
   * After the inner HTML has rendered.
   */
  async onLoad() {
    this.formID = '#music-settings-form'

    //await this.updateCloudMusicAccounts()

    //this.setMainDotMenuItems() // add "settings" to the main dot menu
    this.watchSyncGroups() // watches for generic changes to the settings form fields
    this.initForm() // inits field listeners for fields with logic imported from submodules

    // init the panel tabs
    this.tabs = new Tabs({
      'selector': '.settings-panel .tabs'
    })

    this.registerEventListeners() // listeners for the close/tab/clicks in the settings
  }

  /**
   * When the element is removed from the document.
   */
  onRemoved() {
    this.removeEventHandlers()
    window.removeEventListener('keyup', this.boundEscKeyHandler)
  }

  /**
   * All event listeners for the settings panel itself
   */
  registerEventListeners() {
    // Any item in the DOM can set the attribute [data-settings="tabName"] which, when clicked,
    // opens the settings panel to that tab.
    __('[data-settings]').on('click', this.closest('music-app'), this.boundOnDataSettingsAttrClick)

    // on click of close
    this.querySelector('.close').addEventListener('click', () => {
      this.close()
    })

    // esc to close
    window.addEventListener('keyup', this.boundEscKeyHandler)
  }

  /**
   * Some fields are too simple to require their own module. Register their events here.
   */
  registerFieldEventListeners() {
    /**
     * When factory reset is clicked
     */
    document.querySelector('#music-settings-form button[name="factory-reset"]').addEventListener('click', (event) => {
      event.preventDefault()

      if (confirm(i18n('settings.factory-reset.confirm'))) {
        if (confirm(i18n('danger-confirm'))) {
          Bridge.ipcSay('factory-reset')
        }
      }
    })

    /**
     * When the color theme is switched.
     */
    __(this).find('select[name="color_theme"]').on('change', function() {
      let selectedTheme = __(this).value()
      __('music-app').attr('color-theme', selectedTheme)
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
   * Updates the HTML in the the cloud music section.
   */
  // async updateCloudMusicAccounts() {
  //   // if the user is logged in
  //   if (__('music-app').attr('user-is-logged-in')) {
  //     // get all connections
  //     let usersQuery = await new Query({
  //       'table': 'users',
  //       'itemsPerPage': -1
  //     })

  //     // no connections
  //     if (!usersQuery.results.length) {
  //       return
  //     }

  //     // update all connections
  //     for (let user of usersQuery.results) {
  //       let providerBlock = __(this).find(`.provider.${user.provider}`)
  //       providerBlock.find('.current').html(i18n('settings.online-accounts.logged-in-as').replace('{{name}}', user.displayname))
  //     }
  //   }
  // }

  /**
   * Adds an entry to the main <dot-menu>
   */
  setMainDotMenuItems() {
    if (!document.querySelector('#main-dot-menu')) {
      return
    }

    __('#main-dot-menu').el().addMenuItems('start', {
      'group': i18n('app-name'),
      'items': {
        /**
         * Open Settings
         */
        [i18n('settings.main-dot-menu')]: {
          'icon': 'atom',
          'cb': (rightClickedEl, menuItem) => {
            this.openSettingsPanel()
            ContextMenu.closeAllContextMenus()
          }
        }
      }
    })
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
   * When the escape key is pressed while the settings panel is open.
   */
  onEscKey(event) {
    if (event.key === 'Escape' && __(this).find('.settings-panel').hasClass('open')) {
      this.close()
    }
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
    __('#music-settings-form [data-sync-with-db="true"] select').on('change', this.onFieldChange)
    __('#music-settings-form [data-sync-with-db="true"] input').on('change', this.onFieldChange)
    __('#music-settings-form [data-sync-with-db="true"] textarea').on('change', this.onFieldChange)
  }

  /**
   * Sets the values for the inputs within [data-sync-with-db="true"] upon modal load
   */
  setSyncGroups() {
    __('#music-settings-form [data-sync-with-db="true"]')
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

    __('music-app').addClass('settings-open')
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
   * Visually closes the settings panel (does not remove from document).
   */
  close() {
    __('music-app').removeClass('settings-open')
    __('.settings-panel').removeClass('open')

    // trigger all 'onClose' callbacks
    for (let cb of this._callbacks.onClose) {
      cb()
    }

    __().releaseFocus()
  }

  /**
   * Right before the modal animates in, init all of the field groups.
   */
  initForm() {
    forms.prepare(this.querySelector('#music-settings-form'))
    this.setSyncGroups()
    langLogic.subscribe()
    this.registerFieldEventListeners()

    // block form submission which would reload the page
    __(this.formID).on('submit', (event) => {
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
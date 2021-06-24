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
import { onLangChange } from './field-logic/lang.js'
import { onColorThemeChange } from './field-logic/color-theme.js'
import { onAccentColorChange } from './field-logic/accent-color.js'
import { onCustomCssChange } from './field-logic/custom-css.js'
import { onDeveloperModeChange } from './field-logic/developer-mode.js'

export class AppSettings extends Lowrider {
  constructor() {
    super()
    this.formId = '#app-settings-form'
    this.boundOnDataSettingsAttrClick = this.onDataSettingsAttrClick.bind(this)
    this.onFieldChange = null

    // cache of settings event callbacks
    this._callbacks = {
      'onSettingChange': [], // when the user changes a field
      'onClose': [] // when the settings panel is closed
    }
  }

  /**
   * Call this to init all settings fields.
   */
  formSetup() {
    forms.prepare(this.querySelector(this.formId))
    this.setSyncGroups()
    this.registerFieldEventListeners()

    // block form submission which would reload the page
    __(this.formId).on('submit', (event) => {
      event.preventDefault()
    })

    this.watchSyncGroups()

    // make the currently selected accent color swatch active
    let chosenAccentColor = window.localStorage.getItem('accent_color')
    if (chosenAccentColor) {
      this.querySelector(`input[name="accent_color"][value="${chosenAccentColor}"]`).closest('label').classList.add('active')
    }
  }

  /**
   * Some fields are too simple to require their own module. Register their events here.
   */
  registerFieldEventListeners() {
    this.registerCallback('onSettingChange', onLangChange)
    this.registerCallback('onSettingChange', onColorThemeChange)
    this.registerCallback('onSettingChange', onAccentColorChange)
    this.registerCallback('onSettingChange', onCustomCssChange)
    this.registerCallback('onSettingChange', onDeveloperModeChange)

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
     * Manually check for updates
     */
    __(this).find(`${this.formId} button[name="manually-check-for-updates"]`).each((el) => {
      el.addEventListener('click', async () => {
        await Bridge.ipcSay('check-for-updates-and-prompt')
      })
    })
  }

  /**
   * Triggered whenever an element with the data-settings attribute is clicked.
   * These buttons exist outside of the settings panel, and are used to open the
   * panel.
   */
  onDataSettingsAttrClick(event) {
    let tabToShow = __(event.target).attr('data-settings')

    if (!event.target.matches('[data-settings]')) {
      tabToShow = __(event.target.closest('[data-settings]')).attr('data-settings')
    }

    this.openSettingsPanel(tabToShow)
  }

  /**
   * Sets the values for the inputs within [data-sync-with-db] upon modal load
   */
  setSyncGroups() {
    __(`${this.formId} [data-sync-with-db]`).each(async (el) => {
      let optionName = __(el).attr('name')
      let fromDatabase = __(el).attr('data-db')

      let optionValue

      if (fromDatabase === 'electron-main') {
        optionValue = await Bridge.ipcAsk('get-option', optionName)
      } else {
        optionValue = window.localStorage.getItem(optionName)
      }

      //console.log(optionName, optionValue)

      // if no option has been set, let the HTML set the default
      if (optionValue === null) return

      // convert bools, numbers, and null's to primitives
      try {
        let converted = JSON.parse(optionValue)
        optionValue = converted
      } catch (e) {}

      if (el.matches('[type="checkbox"]') || el.matches('[type="radio"]')) {
        if (optionValue) {
          el.checked = true
        } else if (!optionValue) {
          el.checked = false
        }
      } else {
        __(el).value(optionValue)
      }
    })
  }

  /**
   * There are .field-group's in the settings <form> that have
   * [data-sync-with-db], this function will watch them and sync their
   * changes within the table.
   */
  watchSyncGroups() {
    const fieldChange = async (event) => {
      let el = event.target
      let optionName = __(el).attr('name')
      let destinationDatabase = __(el).attr('data-db') // can be 'electron-main' or omitted for localStorage
      let newVal
      
      if (__(el).attr('type') === 'checkbox') {
        newVal = el.checked ? 1 : 0
      } else if (__(el).attr('type') === 'radio') {
        newVal = __(el).closest('.settings-panel').find(`input[type="radio"][name="${optionName}"]:checked`).value()
      } else {
        newVal = __(el).value()
      }

      if (destinationDatabase === 'electron-main') {
        console.log('Setting option in Electron sqlite database', optionName, newVal)
        await Bridge.ipcAsk('set-option', {'option': optionName, 'value': newVal})
      } else {
        console.log('Setting option in localStorage', optionName, newVal)
        window.localStorage.setItem(optionName, newVal)
      }

      if (this._callbacks.onSettingChange.length) {
        for (let cb of this._callbacks.onSettingChange) {
          cb(optionName, newVal, event)
        }
      }
    }

    // handler will get attached directly to Elements
    __(`${this.formId} [data-sync-with-db]`).on('change', fieldChange)
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
   * Allows other custom elements to register a callback with the settings.
   * 
   * @param {string} event - The event type. Supports `onClose`.
   */
  registerCallback(event, cb) {
    this._callbacks[event].push(cb)
  }

  /**
   * See getFieldTemplate()
   * 
   * Returns an object of all strigified templates.
   */
  getFieldTemplates() {
    let templates = [
      'advanced/developer',
      'advanced/factory-reset',
      'general/lang',
      'general/confirm-electron-quit',
      'general/notifications',
      'general/start-page',
      'general/updates',
      'modals/folder-structure',
      'playback/flags',
      'theme/color-theme',
      'theme/custom-css',
      'theme/swatches',
    ]
    let obj = {}

    for (let templateName of templates) {
      obj[`settings-field/${templateName}`] = this.getFieldTemplate(templateName)
    }

    return obj
  }

  /**
   * I really hate to embed HTML in JS like this, but because of this bug...
   *
   * https://github.com/electron-userland/electron-builder/issues/3185
   *
   * ...I cannot have HTML files in a renderer node_modules, because they won't
   * be copied into the asar archive. The only templates affected are the global
   * ones shared between all client apps in the `cardinal-shared-components`
   * package.
   *
   * The plan is to serve HTML templates with the API for mobile device support,
   * so until then, this will have to do.
   * 
   * FIXME
   */
  getFieldTemplate(field) {
    switch (field) {
      case 'advanced/developer':
        return /*html*/`
        <div class="form-group native-only" data-group="developer">
          <h4 class="group-title">{i18n{settings.developer.title}}</h4>
        
          <input type="checkbox" data-sync-with-db name="developer_mode" data-label="{i18n{settings.developer.enable-label}}">
        </div>`

      case 'advanced/factory-reset':
        return /*html*/`
        <div class="form-group factory-reset-group native-only" data-group="factory-reset">
          <h4 class="group-title">{i18n{settings.factory-reset.title}}</h4>

          <button class="danger" type="button" name="factory-reset">
            <span tabindex="-1">{i18n{settings.factory-reset.desc}}</span>
          </button>
        </div>`

      case 'general/lang':
        return /*html*/`
        <div class="form-group" data-group="language">
          <h4 class="group-title">{i18n{settings.language.title}}</h4>

          <select name="lang" data-sync-with-db>
            <option value="en" selected="selected">English</option>
            <option value="fr">Français</option>
          </select>
        </div>`

      case 'general/notifications':
        return /*html*/`
        <div class="form-group native-only" data-group="notifications">
          <h4 class="group-title">{i18n{settings.notifications.title}}</h4>

          <input type="checkbox" data-sync-with-db name="notification_on_song_change" data-label="{i18n{settings.notifications.song-change-label}}">
        </div>`

      case 'general/confirm-electron-quit':
        return /*html*/`
        <div class="form-group native-only" data-group="confirm-quit">
          <input type="checkbox" data-sync-with-db data-db="electron-main" name="confirm_electron_quit" data-label="{i18n{settings.confirm-electron-quit}}">
        </div>`

      case 'general/start-page':
        return /*html*/`
        <div class="form-group" data-group="start-page">
          <h4 class="group-title">{i18n{settings.start-page.title}}</h4>

          <select name="start_page" data-sync-with-db>
            <optgroup label="{i18n{nav.music.title}}">
              <option value="/explore-music">{i18n{nav.music.explore}}</option>
              <option value="/artists">{i18n{nav.music.artists}}</option>
              <option value="/music-releases">{i18n{nav.music.releases}}</option>
              <option value="/tracks">{i18n{nav.music.tracks}}</option>
              <option value="/playlists">{i18n{nav.music.playlists}}</option>
              <option value="/music-genres">{i18n{nav.music.genres}}</option>
            </optgroup>
          </select>
        </div>`

      case 'general/updates':
        return /*html*/`
        <div class="form-group native-only" data-group="updates">
          <!-- <h4 class="group-title">{i18n{settings.updates.title}}</h4> -->

          <input type="checkbox" data-sync-with-db name="auto_check_for_updates" data-label="{i18n{settings.updates.auto-check-label}}">

          <div class="manual">
            <button name="manually-check-for-updates" class="btn" type="button">{i18n{settings.updates.manual-check-label}}</button>
          </div>
        </div>`

      case 'modals/folder-structure':
        return /*html*/`
        <div class="folder-structure-guide">
          <div class="modal-header">
            <h2>{i18n{folder-structure-guide.title}}</h2>
          </div>

          <div class="text-content">
            {i18n{folder-structure-guide.desc-before-examples}}
          </div>

          <div class="folder-structure-examples">
            <!-- Music Examples -->
            <h3>{i18n{folder-structure-guide.example.music.title}}</h3>

            <div class="code-blocks half-half">
              <code>
                /{i18n{folder-structure-guide.example.music.code.artist}}<br>
                &nbsp;&nbsp;/{i18n{folder-structure-guide.example.music.code.album}}<br>
                &nbsp;&nbsp;&nbsp;&nbsp;• {i18n{folder-structure-guide.example.music.code.song}}<br>
                &nbsp;&nbsp;&nbsp;&nbsp;• {i18n{folder-structure-guide.example.music.code.cover-art}}<br>
              </code>
              <div class="or">{i18n{or}}</div>
              <code>
                /{i18n{folder-structure-guide.example.music.code.artist}}<br>
                &nbsp;&nbsp;/{i18n{folder-structure-guide.example.music.code.album}}<br>
                &nbsp;&nbsp;&nbsp;&nbsp;/{i18n{folder-structure-guide.example.music.code.disc}}<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;• {i18n{folder-structure-guide.example.music.code.song}}<br>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;• {i18n{folder-structure-guide.example.music.code.cover-art}}<br>
              </code>
            </div>
          </div>

          <div class="supported-types">
            <h3>{i18n{folder-structure-guide.supported-types.title}}</h3>

            <table class="informational">
              <tr>
                <td>{i18n{folder-structure-guide.example.music.title}}</td>
                <td>
                  <code class="inline">.mp3</code>
                  <code class="inline">.flac</code>
                </td>
              </tr>
              <tr>
                <td>{i18n{folder-structure-guide.example.tv-movies.title}}</td>
                <td>
                  <code class="inline">.mp4</code>
                </td>
              </tr>
              <tr>
                <td>{i18n{folder-structure-guide.supported-types.artwork}}</td>
                <td>
                  <code class="inline">.jpg</code>
                  <code class="inline">.png</code>
                  <code class="inline">.gif</code>
                </td>
              </tr>
            </table>
          </div>
        </div>`

      case 'playback/flags':
        return /*html*/`
        <div class="form-group" data-group="flags">
          <h4 class="group-title">{i18n{settings.music-playback.title}}</h4>

          <input type="checkbox" data-sync-with-db name="always_load_whole_song" data-label="{i18n{settings.music-playback.always-load-whole-song}}">
        </div>`

      case 'theme/color-theme':
        return /*html*/`
        <div class="form-group" data-group="color-theme">
          <h4 class="group-title">{i18n{settings.color-theme.title}}</h4>

          <select name="color_theme" data-sync-with-db>
            <option value="dark" selected="selected">{i18n{settings.color-theme.option.dark}}</option>
            <option value="light">{i18n{settings.color-theme.option.light}}</option>
          </select>
        </div>`

      case 'theme/custom-css':
        return /*html*/`
        <div class="form-group mouse-only" data-group="custom-css">
          <h4 class="group-title">{i18n{settings.custom-css.title}}</h4>

          <div class="instructions">
            <div class="slidetoggle slim">
              <button class="label">
                <span tabindex="-1">
                  <i class="warning-icon fas fa-exclamation-triangle"></i>
                  {i18n{settings.custom-css.notice}}
                </span>
              </button>

              <span class="content">{i18n{settings.custom-css.instructions}}</span>
            </div>
          </div>

          <textarea class="custom-css" data-sync-with-db name="custom_css"></textarea>
        </div>`

      case 'theme/swatches':
        return /*html*/`
        <div class="form-group" data-group="accent-color">
          <h4 class="group-title">{i18n{settings.accent-color.title}}</h4>

          <div class="swatches">
            <input type="radio" name="accent_color" data-sync-with-db title="The Last Popsicle Purple" type="button" class="color-swatch clicks" value="#a174dd">
            <input type="radio" name="accent_color" data-sync-with-db title="Flamingo Jam Pink" type="button" class="color-swatch clicks" value="#e9219c">
            <input type="radio" name="accent_color" data-sync-with-db title="Rapper Name lil'Blue" type="button" class="color-swatch clicks" value="#4da3bd">
            <input type="radio" name="accent_color" data-sync-with-db title="The Bold and the Bluetiful" type="button" class="color-swatch clicks" value="#3793cf">
            <input type="radio" name="accent_color" data-sync-with-db title="Cantaloupe Green" type="button" class="color-swatch clicks" value="#57b983">
            <input type="radio" name="accent_color" data-sync-with-db title="Zergling Rush Green" type="button" class="color-swatch clicks" value="#379c3f">
            <input type="radio" name="accent_color" data-sync-with-db title="Nuclear Warning Yellow" type="button" class="color-swatch clicks" value="#ccb118">
            <input type="radio" name="accent_color" data-sync-with-db title="At Least It's Not Brown, Orange" type="button" class="color-swatch clicks" value="#d45912">
            <input type="radio" name="accent_color" data-sync-with-db title="Alien Invasion Red" type="button" class="color-swatch clicks" value="#cc4c43">
            <input type="radio" name="accent_color" data-sync-with-db title="Soulless Grey" type="button" class="color-swatch clicks" value="#575757">
          </div>
        </div>`
    }
  }
}
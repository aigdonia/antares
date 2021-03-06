'use strict';
import { ipcRenderer } from 'electron';

export default class {
   static getFunctionInformations (params) {
      return ipcRenderer.invoke('get-function-informations', params);
   }

   static dropFunction (params) {
      return ipcRenderer.invoke('drop-function', params);
   }

   static alterFunction (params) {
      return ipcRenderer.invoke('alter-function', params);
   }

   static createFunction (params) {
      return ipcRenderer.invoke('create-function', params);
   }
}

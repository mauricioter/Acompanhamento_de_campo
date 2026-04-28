const { React, ReactDOM, htm } = window;
const { useEffect, useMemo, useState } = React;
const { createRoot } = ReactDOM;
const html = htm.bind(React.createElement);

export {
    React,
    createRoot,
    html,
    useEffect,
    useMemo,
    useState,
};
